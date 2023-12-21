import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { BridgeTransaction, BridgeTransactionStatus } from "@orbiter-finance/seq-models";
import { AlertMessageChannel, AlertService } from "@orbiter-finance/alert";
import { groupBy, sortBy, orderBy, maxBy, sumBy } from 'lodash';
import {
  type MonitorState,
  type TransferAmountTransaction,
} from "./sequencer.interface";
import { LoggerDecorator, arePropertyValuesConsistent, isEmpty, OrbiterLogger, sleep, equals, JSONStringify } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { MemoryQueue } from '../../utils/MemoryQueue'
import { AccountFactoryService } from "../../factory";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { OrbiterAccount, StoreService, TransactionSendAfterError, TransactionSendIgError, TransferResponse } from "@orbiter-finance/blockchain-account";

@Injectable()
export class SequencerScheduleService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly applicationStartupTime: number = Date.now();
  private queue: { [key: string]: MemoryQueue<BridgeTransactionModel> } = {};
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private readonly envConfig: ENVConfigService,
    private alertService: AlertService,
    private accountFactoryService: AccountFactoryService,
    private readonly consumerService: ConsumerService) {

    this.checkDBTransactionRecords();
    const subMakers = this.envConfig.get("SUB_WAIT_TRANSFER_MAKER", []);
    if (subMakers && subMakers.length > 0) {
      for (const key of subMakers) {
        this.consumerService.consumeMakerWaitTransferMessage(this.addQueue.bind(this), key)
      }
    } else {
      this.consumerService.consumeMakerWaitTransferMessage(this.addQueue.bind(this))
    }
  }

  // @Cron("0 */2 * * * *")
  private checkDBTransactionRecords() {
    const owners = this.envConfig.get("MAKERS") || [];
    for (const owner of owners) {
      if (owner.toLocaleLowerCase() != '0x4eaf936c172b5e5511959167e8ab4f7031113ca3') {
        continue;
      }
      // read db history
      this.readDBTransactionRecords(owner.toLocaleLowerCase()).catch((error) => {
        this.logger.error(
          "checkDBTransactionRecords -> readDBTransactionRecords error",
          error
        );
      });
    }
  }
  private async readDBTransactionRecords(owner: string) {
    const maxTransferTimeoutMinute = this.validatorService.getTransferGlobalTimeout();
    const where = {
      status: 0,
      sourceMaker: owner,
      targetId: null,
      sourceTime: {
        [Op.gte]: dayjs().subtract(maxTransferTimeoutMinute, "minute").toISOString(),
      },
    }
    const records = await this.bridgeTransactionModel.findAll({
      raw: true,
      attributes: [
        "id",
        "transactionId",
        'status',
        "sourceId",
        "targetId",
        'sourceTime',
        "sourceChain",
        "targetChain",
        "sourceAmount",
        "targetAmount",
        "sourceMaker",
        "targetMaker",
        "sourceAddress",
        "targetAddress",
        "sourceSymbol",
        "targetSymbol",
        "sourceNonce",
        "sourceToken",
        "targetToken",
        "responseMaker",
      ],
      where,
      limit: 100
    });
    console.log(records, '=records')
    if (records.length > 0) {
      for (const tx of records) {
        try {
          this.addQueue(tx);
        } catch (error) {
          this.logger.error(
            `[readDBTransactionRecords] ${tx.sourceId} handle error`, error
          );
        }
      }
    }
  }
  async paidSingleBridgeTransaction(bridgeTx: BridgeTransactionModel, queue: MemoryQueue) {
    // is exist
    // if (dayjs(bridgeTx.sourceTime).valueOf() <= this.applicationStartupTime) {
    //   throw new Errors.PaidSourceTimeLessStartupTime()
    // }
    const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
    if (transactionTimeValid) {
      throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
    }
    const isConsume = await queue.store.has(bridgeTx.sourceId);
    if (isConsume) {
      throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
    }
    if (bridgeTx.targetId || Number(bridgeTx.status) != 0) {
      throw new Errors.AlreadyPaid(`${bridgeTx.sourceId} ${bridgeTx.targetId} targetId | ${bridgeTx.status} status`);
    }

    const validDisabledPaid = await this.validatorService.validDisabledPaid(bridgeTx.targetChain);
    if (validDisabledPaid) {
      await queue.add(bridgeTx);
      throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
    }
    const wallets = await this.validatorService.checkMakerPrivateKey(bridgeTx);
    if (!wallets || wallets.length <= 0) {
      await queue.add(bridgeTx);
      throw new Errors.MakerNotPrivetKey();
    }
    const isFluidityOK = await this.validatorService.checkMakerFluidity(bridgeTx.targetChain, bridgeTx.targetMaker, bridgeTx.targetToken, +bridgeTx.targetAmount);
    if (!isFluidityOK) {
      await queue.add(bridgeTx);
      throw new Error(`${bridgeTx.sourceId}`);
    }

    const success = await this.validatorService.validatingValueMatches(
      bridgeTx.sourceSymbol,
      bridgeTx.sourceAmount,
      bridgeTx.targetSymbol,
      bridgeTx.targetAmount
    )
    if (!success) {
      throw new Errors.AmountRiskControlError(`${bridgeTx.sourceId}`)
    }
    // start paid
    const account = await this.accountFactoryService.createMakerAccount(
      bridgeTx.targetMaker,
      bridgeTx.targetChain
    );
    await account.connect(wallets[0].key,bridgeTx.targetMaker);
    const saveRecord = await queue.setEnsureRecord(bridgeTx.sourceId, true);
    if (!saveRecord) {
      throw new Error(`${bridgeTx.sourceId}`);
    }
    try {
      return await this.execSingleTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        this.logger.error(`execSingleTransfer error PaidRollbackError ${bridgeTx.sourceId} message ${error.message}`);
      }
      throw error;
    }
  }
  async execSingleTransfer(
    transfer: TransferAmountTransaction,
    wallet: OrbiterAccount,
  ) {
    const sourceChainId = transfer.sourceChain;
    const sourceHash = transfer.sourceId;
    const transferToken = this.chainConfigService.getTokenByAddress(
      transfer.targetChain,
      transfer.targetToken
    );

    this.logger.info(
      `execSingleTransfer: ${sourceChainId}-${sourceHash}, owner:${wallet.address}`
    );
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    let sourceTx: BridgeTransactionModel;
    try {
      if (!transferToken) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent transferToken (${transfer.targetChain}/${transfer.targetToken})`
        );
      }
      sourceTx = await this.bridgeTransactionModel.findOne({
        attributes: [
          "id",
          "sourceChain",
          "sourceId",
          "status",
          "targetChain",
          "targetSymbol",
          "targetAmount",
          "targetId",
        ],
        where: {
          sourceId: sourceHash,
          sourceChain: sourceChainId,
        },
        transaction,
      });
      if (!sourceTx) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} SourceTx not exist`
        );
      }
      if (sourceTx.status != 0) {
        throw new Errors.AlreadyPaid(`${sourceHash} status ${sourceTx.status}`);
      }
      if (!isEmpty(sourceTx.targetId)) {
        throw new Errors.AlreadyPaid(`${sourceHash} targetId ${sourceTx.targetId}`)
      }
      if (!equals(sourceTx.targetChain, transfer.targetChain)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent target network (${sourceTx.targetChain}/${transfer.targetChain})`
        );
      }

      if (!new BigNumber(sourceTx.targetAmount).eq(transfer.targetAmount)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetAmount (${sourceTx.targetAmount}/${transfer.targetAmount})`
        );
      }

      if (sourceTx.targetSymbol != transfer.targetSymbol) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetSymbol (${sourceTx.targetSymbol}/${transfer.targetSymbol})`
        );
      }
      sourceTx.status = BridgeTransactionStatus.READY_PAID;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
    } catch (error) {
      transaction && (await transaction.rollback());
      throw error;
    }
    // transfer.targetAddress = '0xEFc6089224068b20197156A91D50132b2A47b908';
    let transferResult: TransferResponse;
    try {
      const transferAmount = new BigNumber(transfer.targetAmount).times(
        10 ** transferToken.decimals
      );
      const requestParams = await wallet.pregeneratedRequestParameters(
        transfer
      );
      if (transferToken.isNative) {
        transferResult = await wallet.transfer(
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
          requestParams
        );
      } else {
        transferResult = await wallet.transferToken(
          transferToken.address,
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
          requestParams
        );
      }
      sourceTx.status = BridgeTransactionStatus.PAID_SUCCESS;
      sourceTx.targetId = transferResult.hash;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new TransactionSendAfterError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError || !transferResult?.from) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        sourceTx.status = BridgeTransactionStatus.PAID_CRASH;
        sourceTx.targetMaker = transferResult.from;
        sourceTx.targetId = transferResult && transferResult.hash;
        await sourceTx.save({
          transaction,
        });
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.BRIDGE_SUCCESS,
              targetMaker: tx.from,
            },
            {
              where: {
                id: sourceTx.id,
              },
            }
          );
        })
        .catch((error) => {
          this.alertService.sendMessage(`execSingleTransfer success waitForTransaction error ${transfer.targetChain} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${transfer.targetChain}`,
            error
          );
        });
    }
    return sourceTx.toJSON();
  }
  async execBatchTransfer(
    transfers: TransferAmountTransaction[],
    wallet: OrbiterAccount
  ) {
    const targetChainId = transfers[0].targetChain;
    const transferToken = this.chainConfigService.getTokenByAddress(
      transfers[0].targetChain,
      transfers[0].targetToken
    );
    let transferResult: TransferResponse;
    const sourecIds = transfers.map((tx) => tx.sourceId);
    const toAddressList = transfers.map((tx) => tx.targetAddress);
    const toValuesList = transfers.map((tx) => {
      return BigInt(
        new BigNumber(tx.targetAmount)
          .times(10 ** transferToken.decimals)
          .toFixed(0)
      );
    });
    // lock
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    //
    try {
      const result = await this.bridgeTransactionModel.update(
        {
          targetMaker: wallet.address,
          status: BridgeTransactionStatus.READY_PAID,
        },
        {
          where: {
            sourceId: sourecIds,
            status: 0,
          },
          transaction,
        }
      );
      if (result[0] != sourecIds.length) {
        throw new Error(
          `The number of successful modifications is inconsistent ${sourecIds.join(',')}`
        );
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    try {
      const requestParams = await wallet.pregeneratedRequestParameters(
        transfers
      );
      if (transferToken.isNative) {
        transferResult = await wallet.transfers(
          toAddressList,
          toValuesList,
          requestParams
        );
      } else {
        transferResult = await wallet.transferTokens(
          transferToken.address,
          toAddressList,
          toValuesList,
          requestParams
        );
      }
      // CHANGE 98
      for (let i = 0; i < transfers.length; i++) {
        await this.bridgeTransactionModel.update(
          {
            status: BridgeTransactionStatus.PAID_SUCCESS,
            targetMaker: wallet.address,
            targetId: transferResult && `${transferResult.hash}#${i}`
          },
          {
            where: {
              sourceId: transfers[i].sourceId,
            },
            transaction,
          }
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        for (let i = 0; i < transfers.length; i++) {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.PAID_CRASH,
              targetId: transferResult && `${transferResult.hash}#${i}`
            },
            {
              where: {
                sourceId: transfers[i].sourceId,
              },
              transaction,
            }
          );
        }
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.BRIDGE_SUCCESS,
              targetMaker: tx.from,
            },
            {
              where: {
                sourceId: sourecIds,
              },
            }
          );
        })
        .catch((error) => {
          this.alertService.sendMessage(`execBatchTransfer success waitForTransaction error ${targetChainId} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${targetChainId}`,
            error
          );
        });
    }
    return
  }
  async paidManyBridgeTransaction(bridgeTxs: BridgeTransactionModel[], queue: MemoryQueue) {
    const legalTransaction = [];
    const [targetChain, targetMaker] = queue.id.split('-');
    // 
    const privateKey = await this.validatorService.getSenderPrivateKey(targetMaker);
    if (!privateKey) {
      throw new Errors.MakerNotPrivetKey(`${targetMaker} privateKey ${bridgeTxs.map(row => row.sourceId).join(',')}`);
    }
    for (const bridgeTx of bridgeTxs) {
      try {
        // if (dayjs(bridgeTx.sourceTime).valueOf() <= this.applicationStartupTime) {
        //   throw new Errors.PaidSourceTimeLessStartupTime()
        // }
        const isConsume = await queue.store.has(bridgeTx.sourceId);
        if (isConsume) {
          throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
        }
        if (bridgeTx.targetId || Number(bridgeTx.status) != 0) {
          throw new Errors.AlreadyPaid(`${bridgeTx.sourceId} ${bridgeTx.targetId} targetId | ${bridgeTx.status} status`);
        }
        const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
        if (transactionTimeValid) {
          throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
        }
        const validDisabledPaid = await this.validatorService.validDisabledPaid(bridgeTx.targetChain);
        if (validDisabledPaid) {
          await queue.add(bridgeTx);
          throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
        }
        if (targetMaker != bridgeTx.targetMaker.toLocaleLowerCase()) {
          throw new Errors.BatchPaidSameMaker(`${bridgeTx.sourceId} expect ${targetMaker} get ${bridgeTx.targetMaker}`);
        }
        legalTransaction.push(bridgeTx);
      } catch (error) {
        this.logger.error(`paidManyBridgeTransaction for error ${error.message}`, error);
      }
    }
    const groupData = groupBy(legalTransaction, 'targetToken');
    const maxItem = maxBy(Object.entries(groupData), item => {
      return item[1];
    });
    // cancel
    for (const tokenAddr in groupData) {
      if (tokenAddr != maxItem[0]) {
        queue.addBatch(groupData[tokenAddr])
        delete groupData[tokenAddr];
      }
    }
    const totalValue = sumBy(maxItem[1], item => +item.targetAmount);
    const isFluidityOK = await this.validatorService.checkMakerFluidity(targetChain, targetMaker, maxItem[0], totalValue)
    if (!isFluidityOK) {
      await queue.addBatch(maxItem[1]);
      throw new Error(`${maxItem[1].map(row => row.sourceId).join(',')}`);
    }
    // send
    const account = await this.accountFactoryService.createMakerAccount(
      targetMaker,
      targetChain
    );
    for (let i = maxItem[1].length - 1; i >= 0; i--) {
      const bridgeTx = maxItem[1][i];
      const saveRecord = await queue.setEnsureRecord(bridgeTx.sourceId, true);
      if (!saveRecord) {
        maxItem[1].splice(i, 1);
        this.logger.error(`paidManyBridgeTransaction setEnsureRecord fai ${bridgeTx.sourceId}`);
      }
    }
    await account.connect(privateKey,targetMaker);
    try {
      return await this.execBatchTransfer(maxItem[1], account)
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        this.logger.error(`execBatchTransfer error PaidRollbackError ${targetChain} - ${maxItem[1].map(row => row.sourceId).join(',')} message ${error.message}`);
      }
      throw error;
    }
  }
  async consumptionSendingQueue(bridgeTx: BridgeTransactionModel | Array<BridgeTransactionModel>, queue: MemoryQueue) {
    let result;
    try {
      if (Array.isArray(bridgeTx)) {
        if (bridgeTx.length>1) {
          result = await this.paidManyBridgeTransaction(bridgeTx, queue);
        } else {
          result = await this.paidSingleBridgeTransaction(bridgeTx[0], queue)
        }
      } else {
        result = await this.paidSingleBridgeTransaction(bridgeTx, queue)
      }
      this.logger.info(`${queue.id} consumptionSendingQueue info ${JSONStringify(result)}`);
    } catch (error) {
      this.logger.error(`${queue.id} consumptionSendingQueue error ${error.message}`, error);
    }
    console.log('consumptionSendingQueue result:', result)
    return result;
  }
  async addQueue(tx: BridgeTransactionModel) {
    console.log(`addQueue ${tx.targetChain} - ${tx.sourceChain} - ${tx.sourceId}`);
    if (this.validatorService.transactionTimeValid(tx.sourceChain, tx.sourceTime)) {
      this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} Exceeding the effective payment collection time failed`)
      return
    }
    const checkResult = await this.validatorService.optimisticCheckTxStatus(tx.sourceId, tx.sourceChain)
    if (!checkResult) {
      this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} optimisticCheckTxStatus failed`)
      return
    }
    if (!tx.targetMaker) {
      this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId}  targetMaker is null`)
      return
    }
    const queueKey = `${tx.targetChain}-${tx.targetMaker.toLocaleLowerCase()}`;
    const batchTransferCount = this.validatorService.getPaidTransferCount(tx.targetChain);
    if (!this.queue[queueKey]) {
      const queue = new MemoryQueue<BridgeTransactionModel>(queueKey, {
        consumeFunction: this.consumptionSendingQueue.bind(this),
        batchSize: batchTransferCount,
      })
      this.queue[queueKey] = queue;
    }
    const queue = this.queue[queueKey];
    // exist check
    const ensureExists = await queue.ensureExists(tx.sourceId);
    if (ensureExists) {
      return this.logger.info(`addQueue ${tx.targetChain} ensureExists ${tx.sourceChain} - ${tx.sourceId}`);
    }
    const ensureQueue  = await queue.ensureQueue(tx.sourceId);
    if (ensureQueue) {
      return this.logger.info(`addQueue ${tx.targetChain} ensureQueue ${tx.sourceChain} - ${tx.sourceId}`);
    }
    queue.setBatchSize(batchTransferCount)
    queue.add(tx);
  }

}