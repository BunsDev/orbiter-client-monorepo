import { Cron, Interval } from '@nestjs/schedule';
import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { AlertService } from "@orbiter-finance/alert";
import { groupBy, maxBy, sumBy, join } from 'lodash';
import { LoggerDecorator, isEmpty, OrbiterLogger, sleep, equals, JSONStringify, getObjKeyByValue } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { AccountFactoryService } from "../../factory";
import * as Errors from "../../utils/Errors";
import { TransferService } from "./transfer.service";
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { TransactionSendConfirmFail } from "@orbiter-finance/blockchain-account";
import { LockData } from './sequencer.interface';

const Lock: { [key: string]: LockData } = {}
@Injectable()
export class SequencerScheduleService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly applicationStartupTime: number = Date.now();
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private readonly envConfig: ENVConfigService,
    private alertService: AlertService,
    private accountFactoryService: AccountFactoryService,
    private transferService: TransferService,
    @InjectRedis() private readonly redis: Redis,
    private readonly consumerService: ConsumerService) {
    this.checkDBTransactionRecords();
    const subMakers = this.envConfig.get("SUB_WAIT_TRANSFER_MAKER", []);
    if (subMakers && subMakers.length > 0) {
      for (const key of subMakers) {
        this.consumerService.consumeMakerWaitClaimTransferMessage(this.consumptionQueue.bind(this), key)
      }
    } else {
      this.consumerService.consumeMakerWaitClaimTransferMessage(this.consumptionQueue.bind(this))
    }
  }
  @Cron("0 */2 * * * *")
  private checkDBTransactionRecords() {
    const owners = this.envConfig.get("MAKERS") || [];
    for (const owner of owners) {
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
    const where: any = {
      status: 0,
      sourceMaker: owner,
      targetId: null,
      sourceTime: {
        [Op.gte]: dayjs().subtract(maxTransferTimeoutMinute, "minute").toISOString(),
      },
    };
    const enablePaidChains: string[] = this.envConfig.get("ENABLE_PAID_CHAINS");
    if (!enablePaidChains) {
      this.logger.warn('ENABLE_PAID_CHAINS not found');
      return;
    }
    const enablePaidVersion: string[] = this.envConfig.get("ENABLE_PAID_VERSION");
    if (!enablePaidVersion) {
      this.logger.warn('ENABLE_PAID_VERSION not found');
      return;
    }
    if (!enablePaidChains.includes('*')) {
      where['targetChain'] = enablePaidChains;
    }
    if (!enablePaidVersion.includes('*')) {
      where['version'] = enablePaidVersion;
    }
    const records = await this.bridgeTransactionModel.findAll({
      raw: true,
      order: [['id', 'asc'], ['sourceTime', 'asc']],
      attributes: [
        'targetChain',
        'targetMaker',
        'sourceId'
      ],
      where,
    });
    if (records.length > 0) {
      for (const tx of records) {
        this.enqueueMessage(`${tx.targetChain}-${tx.targetMaker.toLocaleLowerCase()}`, tx.sourceId).catch(error => {
          this.logger.error(
            `[readDBTransactionRecords] enqueueMessage handle error ${tx.sourceId}`, error
          );
        })
      }
    }
  }
  @Interval(1000)
  private readCacheQueue() {
    let chainIds = this.envConfig.get("ENABLE_PAID_CHAINS") || [];
    if (chainIds.includes('*')) {
      chainIds = this.chainConfigService.getAllChains().map(item => item.chainId);
    }
    const owners = this.envConfig.get("MAKERS") || [];
    for (const chainId of chainIds) {
      for (const owner of owners) {
        // read db history
        const privateKey = this.validatorService.getSenderPrivateKey(owner);
        if (!privateKey) {
          continue;
        }
        this.readQueueExecByKey(`${chainId}-${owner.toLocaleLowerCase()}`);
      }
    }
  }
  async enqueueMessage(QUEUE_NAME: string, message: string) {
    const isMemberExists = await this.redis.sismember(QUEUE_NAME + ':set', message);
    if (!isMemberExists) {
      await this.redis.lpush(QUEUE_NAME, message);
      await this.redis.sadd(QUEUE_NAME + ':set', message);
      // console.log(`Enqueued: ${message}`);
    } else {
      console.log(`Message "${message}" already exists in the queue.`);
    }
  }

  async dequeueMessages(QUEUE_NAME: string, count: number) {
    const messages = await this.redis.lrange(QUEUE_NAME, -count, -1);
    if (messages.length > 0) {
      // await this.redis.ltrim(QUEUE_NAME, 0, -count - 1);
      for (const message of messages) {
        await this.redis.lrem(QUEUE_NAME, 1, message);
        await this.redis.srem(QUEUE_NAME + ':set', message);
      }
      console.log(`Dequeued: ${messages.join(', ')}`);
      return messages;
    } else {
      return [];
    }
  }
  private async readQueueExecByKey(queueKey: string) {
    let records;
    const [targetChain, targetMaker] = queueKey.split('-');
    try {
      if (!Lock[queueKey]) {
        Lock[queueKey] = {
          locked: false,
          prevTime: Date.now()
        }
      }
      if (Lock[queueKey].locked === true) {
        return;
      }
      const globalPaidInterval = this.envConfig.get(`PaidInterval`, 1000);
      const paidInterval = this.envConfig.get(`${targetChain}.PaidInterval`, globalPaidInterval)
      Lock[queueKey].locked = true;
      const batchSize = this.validatorService.getPaidTransferCount(targetChain);
      if (batchSize <= 0) {
        return;
      }
      const queueLength = await this.redis.llen(queueKey);
      // 1. If the number of transactions is reached, use aggregation, if not, use single transaction
      // 2. If aggregation is not reached within the specified time, send all, otherwise continue to wait.
      const paidType = this.envConfig.get(`${targetChain}.PaidType`, 1);
      let hashList: string[] = [];
      if (+paidType === 2) {
        const maxPaidTransferCount = this.envConfig.get(`${targetChain}.PaidMaxTransferCount`, batchSize * 2);
        if (queueLength >= batchSize) {
          hashList = await this.dequeueMessages(queueKey, maxPaidTransferCount);
        } else {
          // is timeout
          if (Date.now() - Lock[queueKey].prevTime < paidInterval) {
            return;
          }
          hashList = await this.dequeueMessages(queueKey, queueLength);
        }
      } else {
        if (Date.now() - Lock[queueKey].prevTime < paidInterval) {
          return;
        }
        const maxPaidTransferCount = this.envConfig.get(`${targetChain}.PaidMaxTransferCount`, batchSize * 2);
        hashList = await this.dequeueMessages(queueKey, queueLength >= batchSize ? maxPaidTransferCount : 1);
      }
      for (let i = hashList.length - 1; i >= 0; i--) {
        const isConsumed = await this.isConsumed(targetChain, hashList[i]);
        if (isConsumed) {
          hashList.splice(i, 1);
        }
      }
      if (hashList.length <= 0) {
        return;
      }
      records = await this.bridgeTransactionModel.findAll({
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
          'ruleId',
          "version"
        ],
        where: {
          sourceId: hashList
        },
      });
      Lock[queueKey].prevTime = Date.now();
      const result = await this.consumptionSendingQueue(records, queueKey)
      Lock[queueKey].prevTime = Date.now();
    } catch (error) {
      this.alertService.sendMessage(`consumptionSendingQueue error ${error.message}`, "TG")
      this.logger.error(`readQueueExecByKey error: message ${error.message}`, error);
      if (error instanceof Errors.PaidRollbackError || error instanceof TransactionSendConfirmFail) {
        for (const tx of records) {
          this.enqueueMessage(queueKey, tx.sourceId);
        }
        this.logger.error(`execBatchTransfer error PaidRollbackError ${queueKey} - ${records.map(row => row.sourceId).join(',')} message ${error.message}`);
      }
    } finally {
      Lock[queueKey].locked = false;
    }
  }
  async removeConsumeStatus(targetChainId: string, hashList: string | Array<string>) {
    // const data = Array.isArray(hashList) ? ...hashList : hashList;
    if (hashList.length <= 0) {
      return;
    }
    if (Array.isArray(hashList)) {
      return await this.redis.srem(`Consume:${targetChainId}`, ...hashList);
    } else {
      return await this.redis.srem(`Consume:${targetChainId}`, hashList);
    }
  }
  async saveConsumeStatus(targetChainId: string, hashList: string | Array<string>) {
    // const data = Array.isArray(hashList) ? ...hashList : hashList;
    if (hashList.length <= 0) {
      return;
    }
    if (Array.isArray(hashList)) {
      return await this.redis.sadd(`Consume:${targetChainId}`, ...hashList);
    } else {
      return await this.redis.sadd(`Consume:${targetChainId}`, hashList);
    }
  }
  async isConsumed(targetChainId: string, hash: string) {
    const isMemberExist = await this.redis.sismember(`Consume:${targetChainId}`, hash);
    return isMemberExist > 0;
  }

  async paidSingleBridgeTransaction(bridgeTx: BridgeTransactionModel) {
    // is exist
    const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
    if (transactionTimeValid) {
      throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
    }
    const isConsume = await this.isConsumed(bridgeTx.targetChain, bridgeTx.sourceId);
    if (isConsume) {
      throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
    }
    if (bridgeTx.targetId || Number(bridgeTx.status) != 0) {
      throw new Errors.AlreadyPaid(`${bridgeTx.sourceId} ${bridgeTx.targetId} targetId | ${bridgeTx.status} status`);
    }

    const validDisabledPaid = await this.validatorService.validDisabledPaid(bridgeTx.targetChain);
    if (validDisabledPaid) {
      throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
    }
    const wallets = await this.validatorService.checkMakerPrivateKey(bridgeTx);
    if (!wallets || wallets.length <= 0) {
      throw new Errors.MakerNotPrivetKey(`sourceId: ${bridgeTx.sourceId}  ${bridgeTx.responseMaker.join(',')}`);
    }
    const isFluidityOK = await this.validatorService.checkMakerFluidity(bridgeTx.targetChain, bridgeTx.targetMaker, bridgeTx.targetToken, +bridgeTx.targetAmount);
    if (!isFluidityOK) {
      throw new Errors.InsufficientLiquidity(`${bridgeTx.targetChain} - ${bridgeTx.targetMaker}`)
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
    await this.saveConsumeStatus(bridgeTx.targetChain, bridgeTx.sourceId);
    try {
      return await this.transferService.execSingleTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        await this.removeConsumeStatus(bridgeTx.targetChain, bridgeTx.sourceId)
        this.logger.error(`execSingleTransfer error PaidRollbackError ${bridgeTx.sourceId} message ${error.message}`);
      }
      throw error;
    }
  }
  async paidSingleBridgeInscriptionTransaction(bridgeTx: BridgeTransactionModel, queueKey: string) {
    const sourceChain = this.chainConfigService.getChainInfo(bridgeTx.sourceChain);
    if (!sourceChain) {
      throw new Error(`${bridgeTx.sourceId} - ${bridgeTx.sourceChain} sourceChain not found`);
    }
    const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
    if (transactionTimeValid) {
      throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
    }
    const isConsume = await this.isConsumed(bridgeTx.targetChain, bridgeTx.sourceId);
    if (isConsume) {
      throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
    }
    if (bridgeTx.targetId || Number(bridgeTx.status) != 0) {
      throw new Errors.AlreadyPaid(`${bridgeTx.sourceId} ${bridgeTx.targetId} targetId | ${bridgeTx.status} status`);
    }

    const validDisabledPaid = await this.validatorService.validDisabledPaid(bridgeTx.targetChain);
    if (validDisabledPaid) {
      throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
    }
    const wallets = await this.validatorService.checkMakerPrivateKey(bridgeTx);
    if (!wallets || wallets.length <= 0) {
      throw new Errors.MakerNotPrivetKey(`sourceId: ${bridgeTx.sourceId}  ${bridgeTx.responseMaker.join(',')}`);
    }
    const isFluidityOK = await this.validatorService.checkMakerInscriptionFluidity(bridgeTx.ruleId, bridgeTx.targetSymbol, +bridgeTx.targetAmount);
    if (!isFluidityOK) {
      throw new Errors.InsufficientLiquidity(`${bridgeTx.targetChain} - ${bridgeTx.targetMaker} - ${bridgeTx.targetSymbol}`)
    }
    // start paid
    const account = await this.accountFactoryService.createMakerAccount(
      bridgeTx.targetMaker,
      bridgeTx.targetChain
    );
    await account.connect(wallets[0].key, bridgeTx.targetMaker);
    try {
      await this.saveConsumeStatus(bridgeTx.targetChain, bridgeTx.sourceId);
      return await this.transferService.execSingleInscriptionTransfer(bridgeTx, account);
    } catch (error) {
      await this.handlePaidTransactionError(error, [bridgeTx.sourceId], bridgeTx.targetChain);
    }
  }
  async handlePaidTransactionError(error, sourceIds: string[], targetChain: string) {
    try {
      if (error instanceof Errors.PaidRollbackError || error instanceof TransactionSendConfirmFail) {
        await this.removeConsumeStatus(targetChain, sourceIds);
      }
    } catch (cleanupError) {
      this.logger.error(`handlePaidTransactionError error ${targetChain} - ${sourceIds} message ${error.message}`, error);
    }
    throw error;
  }

  async paidManyBridgeInscriptionTransaction(bridgeTxs: BridgeTransactionModel[], queueKey: string) {
    const legalTransaction: BridgeTransactionModel[] = [];
    const [targetChain, targetMaker] = queueKey.split('-');
    //
    const privateKey = await this.validatorService.getSenderPrivateKey(targetMaker);
    if (!privateKey) {
      throw new Errors.MakerNotPrivetKey(`${targetMaker} privateKey ${bridgeTxs.map(row => row.sourceId).join(',')}`);
    }
    for (const bridgeTx of bridgeTxs) {
      try {
        if (bridgeTx.version != bridgeTxs[0].version) {
          throw new Error('The versions of batch refunds are inconsistent')
        }
        const sourceChain = this.chainConfigService.getChainInfo(bridgeTx.sourceChain);
        if (!sourceChain) {
          throw new Error(`${bridgeTx.sourceId} - ${bridgeTx.sourceChain} sourceChain not found`);
        }
        const isConsume = await this.isConsumed(bridgeTx.targetChain, bridgeTx.sourceId);
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
          throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
        }
        if (targetMaker != bridgeTx.targetMaker.toLocaleLowerCase()) {
          throw new Errors.BatchPaidSameMaker(`${bridgeTx.sourceId} expect ${targetMaker} get ${bridgeTx.targetMaker}`);
        }
        const totalValue = sumBy(legalTransaction, item => +item.targetAmount);
        const isFluidityOK = await this.validatorService.checkMakerInscriptionFluidity(bridgeTx.ruleId, bridgeTx.targetSymbol, totalValue);
        if (!isFluidityOK) {
          throw new Errors.InsufficientLiquidity(`${bridgeTx.targetChain} - ${bridgeTx.targetMaker} - ${bridgeTx.targetSymbol}`)
        }
        legalTransaction.push(bridgeTx);
      } catch (error) {
        this.logger.error(`paidManyBridgeInscriptionTransaction for error ${error.message}`, error);
      }
    }
    if (legalTransaction.length === 0) {
      throw new Error('not data');
    }
    // send
    const account = await this.accountFactoryService.createMakerAccount(
      targetMaker,
      targetChain
    );

    await account.connect(privateKey, targetMaker);
    const sourceIds = legalTransaction.map(tx => tx.sourceId);
    try {
      await this.saveConsumeStatus(targetChain, sourceIds);
      if (legalTransaction.length == 1) {
        return await this.transferService.execSingleInscriptionTransfer(legalTransaction[0], account)
      }
      return await this.transferService.execBatchInscriptionTransfer(legalTransaction, account)
    } catch (error) {
      await this.handlePaidTransactionError(error, sourceIds, targetChain);
    }
  }
  async paidManyBridgeTransaction(bridgeTxs: BridgeTransactionModel[], queueKey: string) {
    const legalTransaction = [];
    const [targetChain, targetMaker] = queueKey.split('-');
    //
    const privateKey = await this.validatorService.getSenderPrivateKey(targetMaker);
    if (!privateKey) {
      throw new Errors.MakerNotPrivetKey(`${targetMaker} privateKey ${bridgeTxs.map(row => row.sourceId).join(',')}`);
    }
    for (const bridgeTx of bridgeTxs) {
      try {
        if (bridgeTx.version != bridgeTxs[0].version) {
          throw new Error('The versions of batch refunds are inconsistent')
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
          // await queue.add(bridgeTx);
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
        delete groupData[tokenAddr];
      }
    }
    const totalValue = sumBy(maxItem[1], item => +item.targetAmount);
    const targetToken = maxItem[0];
    const isFluidityOK = await this.validatorService.checkMakerFluidity(targetChain, targetMaker, targetToken, totalValue)
    if (!isFluidityOK) {
      throw new Errors.InsufficientLiquidity(`${targetChain} - ${targetMaker} - ${targetToken}`)
    }
    // send
    const account = await this.accountFactoryService.createMakerAccount(
      targetMaker,
      targetChain
    );

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

  async consumptionSendingQueue(bridgeTx: BridgeTransactionModel | Array<BridgeTransactionModel>, queueKey: string) {
    let result;
    try {
      if (Array.isArray(bridgeTx)) {
        if (bridgeTx.length > 1) {
          if (bridgeTx[0].version === '3-0') {
            result = await this.paidManyBridgeInscriptionTransaction(bridgeTx, queueKey)
          } else {
            result = await this.paidManyBridgeTransaction(bridgeTx, queueKey)
          }
        } else {
          if (bridgeTx[0].version === '3-0') {
            result = await this.paidSingleBridgeInscriptionTransaction(bridgeTx[0], queueKey)
          } else {
            result = await this.paidSingleBridgeTransaction(bridgeTx[0])
          }
        }
      } else {
        if (bridgeTx.version === '3-0') {
          result = await this.paidSingleBridgeInscriptionTransaction(bridgeTx, queueKey)
        } else {
          result = await this.paidSingleBridgeTransaction(bridgeTx)
        }
      }
    } catch (error) {
      const sourceIds = Array.isArray(bridgeTx) ? bridgeTx.map(row => row.sourceId).join(',') : bridgeTx.sourceId;
      this.alertService.sendMessage(`${queueKey} consumptionSendingQueue error sourceIds: ${sourceIds} ${error.message}`, "TG")
      this.logger.error(`${queueKey} consumptionSendingQueue error sourceIds: ${sourceIds} ${error.message}`, error);
    }
    this.logger.info(`${queueKey} consumptionSendingQueue info ${JSONStringify(result)}`);
    return result;
  }
  async consumptionQueue(tx: BridgeTransactionModel) {
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
    if (tx.status != 0) {
      this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId}  status not 0`)
      return;
    }
    await this.enqueueMessage(`${tx.targetChain}-${tx.targetMaker.toLocaleLowerCase()}`, tx.sourceId)
    return true;
  }

}
