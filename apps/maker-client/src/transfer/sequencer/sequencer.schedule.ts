import { Cron, Interval } from '@nestjs/schedule';
import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { AlertService } from "@orbiter-finance/alert";
import { groupBy, maxBy, sumBy } from 'lodash';
import { LoggerDecorator, isEmpty, OrbiterLogger, sleep, equals, JSONStringify, getObjKeyByValue } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { MemoryQueue } from '../../utils/MemoryQueue'
import { AccountFactoryService } from "../../factory";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { TransferService } from "./transfer.service";
import Keyv from 'keyv';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
const Lock: any = {}
@Injectable()
export class SequencerScheduleService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly applicationStartupTime: number = Date.now();
  private queue: { [key: string]: MemoryQueue<BridgeTransactionModel> } = {};
  private recordMaxId: number = 0;
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
        this.consumerService.consumeMakerWaitClaimTransferMessage(this.addQueue.bind(this), key)
      }
    } else {
      this.consumerService.consumeMakerWaitClaimTransferMessage(this.addQueue.bind(this))
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
    const where = {
      status: 0,
      sourceMaker: owner,
      targetId: null,
      targetChain: this.envConfig.get("INSCRIPTION_SUPPORT_CHAINS"),
      version: '3-0',
      // id: {
      //   [Op.gte]: this.recordMaxId
      // },
      sourceTime: {
        [Op.gte]: dayjs().subtract(maxTransferTimeoutMinute, "minute").toISOString(),
      },
    }
    const records = await this.bridgeTransactionModel.findAll({
      raw: true,
      order: [['id', 'asc'], ['sourceTime', 'asc']],
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
      where,
      limit: 500
    });
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
    const maxItem = maxBy(records, 'id');
    console.log(`owner: ${owner}, recordMaxId:${this.recordMaxId}, maxItem:${maxItem && maxItem.id}, recordsLength: ${records.length}`);
    if (maxItem && +maxItem.id > this.recordMaxId) {
      this.recordMaxId = +maxItem.id;
      console.log('maxId:', this.recordMaxId);
    }
  }
  @Interval(1000)
  private readCacheQueue() {
    const chainIds = this.envConfig.get("INSCRIPTION_SUPPORT_CHAINS") || [];
    const owners = this.envConfig.get("MAKERS") || [];
    for (const chainId of chainIds) {
      for (const owner of owners) {
        // read db history
        this.readQueueExecByKey(`${chainId}-${owner.toLocaleLowerCase()}`);
      }
    }
  }
  private async readQueueExecByKey(queueKey: string) {
    if (Lock[queueKey] === true) {
      return;
    }
    Lock[queueKey] = true;
    try {
      const [targetChain, targetMaker] = queueKey.split('-');
      const batchSize = this.validatorService.getPaidTransferCount(targetChain);
      const hashList = await this.redis.lrange(queueKey, 0, batchSize - 1);
      await this.redis.ltrim(queueKey, hashList.length, -1);
      for (let i=hashList.length-1;i>=0;i--) {
        const isConsumed = await this.isConsumed(targetChain, hashList[i]);
        if (isConsumed) {
          hashList.splice(i, 1);
        }
      }
      if (hashList.length<=0) {
        return;
      }
      await this.redis.srem(`CurrentQueue:${queueKey}:list`,hashList)
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
          'ruleId',
          "version"
        ],
        where: {
          sourceId: hashList
        },
      });
      await this.consumptionSendingQueue(records, queueKey)
    } catch (error) {
      this.logger.error(`readQueueExecByKey error: message ${error.message}`);
    } finally {
      Lock[queueKey] = false;
    }
  }
  
  async saveConsumeStatus(targetChainId:string, hashList:string | Array<string>) {
    // const data = Array.isArray(hashList) ? ...hashList : hashList;
    if (hashList.length<=0) {
        return;
    }
    if (Array.isArray(hashList)) {
      return await this.redis.sadd(`Consume:${targetChainId}`,...hashList);
    } else {
      return await this.redis.sadd(`Consume:${targetChainId}`,hashList);
    }
  }
  async isConsumed(targetChainId:string, hash:string) {
    const isMemberExist = await this.redis.sismember(`Consume:${targetChainId}`, hash);
    return isMemberExist>0;
  }

  async paidSingleBridgeTransaction(bridgeTx: BridgeTransactionModel) {
    // is exist
    // if (dayjs(bridgeTx.sourceTime).valueOf() <= this.applicationStartupTime) {
    //   throw new Errors.PaidSourceTimeLessStartupTime()
    // }
    const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
    if (transactionTimeValid) {
      throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
    }
    // const isConsume = await queue.store.has(bridgeTx.sourceId);
    // if (isConsume) {
    //   throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
    // }
    if (bridgeTx.targetId || Number(bridgeTx.status) != 0) {
      throw new Errors.AlreadyPaid(`${bridgeTx.sourceId} ${bridgeTx.targetId} targetId | ${bridgeTx.status} status`);
    }

    const validDisabledPaid = await this.validatorService.validDisabledPaid(bridgeTx.targetChain);
    if (validDisabledPaid) {
      throw new Errors.MakerDisabledPaid(`${bridgeTx.sourceId}`)
    }
    const wallets = await this.validatorService.checkMakerPrivateKey(bridgeTx);
    if (!wallets || wallets.length <= 0) {
      throw new Errors.MakerNotPrivetKey();
    }
    const isFluidityOK = await this.validatorService.checkMakerFluidity(bridgeTx.targetChain, bridgeTx.targetMaker, bridgeTx.targetToken, +bridgeTx.targetAmount);
    if (!isFluidityOK) {
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
    await this.saveConsumeStatus(bridgeTx.targetChain,bridgeTx.sourceId);
    try {
      return await this.transferService.execSingleTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        this.logger.error(`execSingleTransfer error PaidRollbackError ${bridgeTx.sourceId} message ${error.message}`);
      }
      throw error;
    }
  }
  async paidSingleBridgeInscriptionTransaction(bridgeTx: BridgeTransactionModel, queueKey:string) {
    // is exist
    // if (dayjs(bridgeTx.sourceTime).valueOf() <= this.applicationStartupTime) {
    //   throw new Errors.PaidSourceTimeLessStartupTime()
    // }
    const sourceChain = this.chainConfigService.getChainInfo(bridgeTx.sourceChain);
    if (!sourceChain) {
      throw new Error(`${bridgeTx.sourceId} - ${bridgeTx.sourceChain} sourceChain not found`);
    }
    const transactionTimeValid = await this.validatorService.transactionTimeValid(bridgeTx.targetChain, bridgeTx.sourceTime);
    if (transactionTimeValid) {
      throw new Errors.MakerPaidTimeExceeded(`${bridgeTx.sourceId}`)
    }
    const isConsume = await this.isConsumed(bridgeTx.targetChain,bridgeTx.sourceId);
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
      throw new Errors.MakerNotPrivetKey();
    }
    const isFluidityOK = await this.validatorService.checkMakerInscriptionFluidity(bridgeTx.ruleId, bridgeTx.targetSymbol, +bridgeTx.targetAmount);
    if (!isFluidityOK) {
      throw new Error(`${bridgeTx.sourceId} Inscription lacks liquidity`);
    }
    // start paid
    const account = await this.accountFactoryService.createMakerAccount(
      bridgeTx.targetMaker,
      bridgeTx.targetChain
    );
    await account.connect(wallets[0].key, bridgeTx.targetMaker);
    await this.saveConsumeStatus(bridgeTx.targetChain,bridgeTx.sourceId);
    try {
      return await this.transferService.execSingleInscriptionTransfer(bridgeTx, account);
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        await this.redis.rpush(queueKey, bridgeTx.sourceId);
      }
      this.logger.error(`execSingleTransfer error ${bridgeTx.sourceId} message ${error.message}`);
      throw error;
    }
  }
  async paidManyBridgeInscriptionTransaction(bridgeTxs: BridgeTransactionModel[], queueKey:string) {
    const legalTransaction: BridgeTransactionModel[] = [];
    const [targetChain, targetMaker] = queueKey.split('-');
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
        const sourceChain = this.chainConfigService.getChainInfo(bridgeTx.sourceChain);
        if (!sourceChain) {
          throw new Error(`${bridgeTx.sourceId} - ${bridgeTx.sourceChain} sourceChain not found`);
        }
        const isConsume = await this.isConsumed(bridgeTx.targetChain,bridgeTx.sourceId);
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
          throw new Error(`${bridgeTx.ruleId}-${bridgeTx.targetSymbol} Inscription lacks liquidity`);
        }
        legalTransaction.push(bridgeTx);
      } catch (error) {
        this.logger.error(`paidManyBridgeInscriptionTransaction for error ${error.message}`, error);
      }
    }
    if (legalTransaction.length===0) {
      throw new Error('not data');
    }
    // send
    const account = await this.accountFactoryService.createMakerAccount(
      targetMaker,
      targetChain
    );
   
    await account.connect(privateKey, targetMaker);
    await this.saveConsumeStatus(targetChain,legalTransaction.map(tx=> tx.sourceId));
    try {
      if (legalTransaction.length == 1) {
        return await this.transferService.execSingleInscriptionTransfer(legalTransaction[0], account)
      }
      return await this.transferService.execBatchInscriptionTransfer(legalTransaction, account)
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        for (const tx of legalTransaction) {
          await this.redis.rpush(queueKey, tx.sourceId);
        }
        this.logger.error(`execBatchTransfer error PaidRollbackError ${targetChain} - ${legalTransaction.map(row => row.sourceId).join(',')} message ${error.message}`);
      }
      throw error;
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
        // if (dayjs(bridgeTx.sourceTime).valueOf() <= this.applicationStartupTime) {
        //   throw new Errors.PaidSourceTimeLessStartupTime()
        // }
        if (bridgeTx.version != bridgeTxs[0].version) {
          throw new Error('The versions of batch refunds are inconsistent')
        }
        // const isConsume = await queue.store.has(bridgeTx.sourceId);
        // if (isConsume) {
        //   throw new Errors.RepeatConsumptionError(`${bridgeTx.sourceId}`);
        // }
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
    const isFluidityOK = await this.validatorService.checkMakerFluidity(targetChain, targetMaker, maxItem[0], totalValue)
    if (!isFluidityOK) {
      throw new Error(`${maxItem[1].map(row => row.sourceId).join(',')}`);
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

  async consumptionSendingQueue(bridgeTx: BridgeTransactionModel | Array<BridgeTransactionModel>, queueKey:string) {
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
      this.logger.error(`${queueKey} consumptionSendingQueue error sourceIds: ${sourceIds} ${error.message}`, error);
    }
    this.logger.info(`${queueKey} consumptionSendingQueue info ${JSONStringify(result)}`);
    return result;
  }
  async addQueue(tx: BridgeTransactionModel) {
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
    if (tx.status!=0) {
      this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId}  status not 0`)
      return;
    }
    const queueKey = `${tx.targetChain}-${tx.targetMaker.toLocaleLowerCase()}`;
    const isMemberExist = await this.redis.sismember(`CurrentQueue:${queueKey}:list`, tx.sourceId);
    if (isMemberExist>=1) {
      return;
    }
    await this.redis.rpush(queueKey, tx.sourceId);
    await this.redis.sadd(`CurrentQueue:${queueKey}:list`, tx.sourceId);
  
  }

}
