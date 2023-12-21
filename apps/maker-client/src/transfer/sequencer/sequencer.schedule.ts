import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { AlertService } from "@orbiter-finance/alert";
import { groupBy, maxBy, sumBy } from 'lodash';
import { LoggerDecorator, isEmpty, OrbiterLogger, sleep, equals, JSONStringify } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { MemoryQueue } from '../../utils/MemoryQueue'
import { AccountFactoryService } from "../../factory";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { TransferService } from "./transfer.service";

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
    private transferService: TransferService,
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
    await account.connect(wallets[0].key, bridgeTx.targetMaker);
    const saveRecord = await queue.setEnsureRecord(bridgeTx.sourceId, true);
    if (!saveRecord) {
      throw new Error(`${bridgeTx.sourceId}`);
    }
    try {
      return await this.transferService.execSingleTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        this.logger.error(`execSingleTransfer error PaidRollbackError ${bridgeTx.sourceId} message ${error.message}`);
      }
      throw error;
    }
  }
  async paidSingleBridgeInscriptionTransaction(bridgeTx: BridgeTransactionModel, queue: MemoryQueue) {
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
    await account.connect(wallets[0].key, bridgeTx.targetMaker);
    const saveRecord = await queue.setEnsureRecord(bridgeTx.sourceId, true);
    if (!saveRecord) {
      throw new Error(`${bridgeTx.sourceId}`);
    }
    try {
      return await this.transferService.execSingleTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        this.logger.error(`execSingleTransfer error PaidRollbackError ${bridgeTx.sourceId} message ${error.message}`);
      }
      throw error;
    }
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
        if (bridgeTx.version != bridgeTxs[0].version) {
          throw new Error('The versions of batch refunds are inconsistent')
        }
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
    await account.connect(privateKey, targetMaker);
    try {
      if (maxItem[1].length == 1) {
        return await this.transferService.execSingleTransfer(maxItem[1][0], account)
      }
      return await this.transferService.execBatchTransfer(maxItem[1], account)
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

        if (bridgeTx.length > 1) {
          if (bridgeTx[0].version === '3-0') {
            // result = await this.paidManyBridgeInscriptionTransaction(bridgeTx, queue)
          } else {
            result = await this.paidManyBridgeTransaction(bridgeTx, queue)
          }
        } else {
          if (bridgeTx[0].version === '3-0') {
            result = await this.paidSingleBridgeInscriptionTransaction(bridgeTx[0], queue)
          } else {
            result = await this.paidSingleBridgeTransaction(bridgeTx[0], queue)
          }
        }
      } else {
        if (bridgeTx.version === '3-0') {
          result = await this.paidSingleBridgeInscriptionTransaction(bridgeTx, queue)
        } else {
          result = await this.paidSingleBridgeTransaction(bridgeTx, queue)
        }
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
    const ensureQueue = await queue.ensureQueue(tx.sourceId);
    if (ensureQueue) {
      return this.logger.info(`addQueue ${tx.targetChain} ensureQueue ${tx.sourceChain} - ${tx.sourceId}`);
    }
    queue.setBatchSize(batchTransferCount)
    queue.add(tx);
  }

}