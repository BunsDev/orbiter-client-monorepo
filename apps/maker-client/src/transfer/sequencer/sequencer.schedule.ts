import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { SequencerService } from "./sequencer.service";
import { ValidatorService } from "../validator/validator.service";
import {
  type MonitorState,
  type TransferAmountTransaction,
} from "./sequencer.interface";
import { LoggerDecorator, arePropertyValuesConsistent, isEmpty, OrbiterLogger } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { AlertService } from "@orbiter-finance/alert";
import { StoreService } from "@orbiter-finance/blockchain-account";

@Injectable()
export class SequencerScheduleService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  public readonly stores = new Map<string, StoreService>(); // chainId + owner
  private storesState: Record<string, MonitorState> = {};

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private readonly sequencerService: SequencerService,
    private readonly envConfig: ENVConfigService,
    private alertService: AlertService,
    private readonly consumerService: ConsumerService) {
    this.checkDBTransactionRecords();
    this.consumerService.consumeMakerWaitTransferMessage(this.consumeMQTransactionRecords.bind(this))
    // this.validatorService.validatingValueMatches("ETH", "1", "ETH", "2")
  }

  @Cron("0 */2 * * * *")
  private checkDBTransactionRecords() {
    const owners = this.envConfig.get("MAKERS") || [];
    for (const chain of this.chainConfigService.getAllChains()) {
      for (const owner of owners) {
        // targetChainId + owner
        const key = `${chain.chainId}-${owner}`.toLocaleLowerCase();
        if (!this.stores.has(key)) {
          this.stores.set(key, new StoreService(chain.chainId));
        }
        const store = this.stores.get(key);
        // read db history
        this.readDBTransactionRecords(store, owner).catch((error) => {
          this.logger.error(
            "checkDBTransactionRecords -> readDBTransactionRecords error",
            error
          );
        });
      }
    }
  }

  private async readDBTransactionRecords(store: StoreService, owner: string) {
    const maxTransferTimeoutMinute = this.validatorService.getTransferGlobalTimeout();
    const where = {
      status: 0,
      targetChain: store.chainId,
      sourceMaker: owner,
      targetId:null,
      // version:"2-0",
      // id: {
      //   [Op.gt]: store.lastId,
      // },
      sourceTime: {
        [Op.gte]: dayjs().subtract(maxTransferTimeoutMinute, "minute").toISOString(),
      },
    }
    const records = await this.bridgeTransactionModel.findAll({
      raw: true,
      attributes: [
        "id",
        "transactionId",
        "sourceId",
        "targetId",
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
    });
    if (records.length > 0) {
      for (const tx of records) {
        try {
          const batchTransferCount = this.validatorService.getPaidTransferCount(tx.targetChain);
          if (batchTransferCount == -1) {
            this.logger.info(
              `${tx.sourceId} To ${tx.targetChain} Setting PaidTransferCount to -1 disables sending`
            );
            continue;
          }
          if (this.validatorService.transactionTimeValid(tx.sourceChain, tx.sourceTime)) {
            this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} Exceeding the effective payment collection time failed`)
            continue
          }
          if (await store.isStoreExist(tx.sourceId, tx.targetToken)) {
            this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} Already exists in the store`)
            continue
          }
          if (await store.isTransfersExist(tx.sourceId)) {
            this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} There is a collection record`)
            continue
          }
          const checkResult = await this.validatorService.optimisticCheckTxStatus(tx.sourceId, tx.sourceChain)
          if (!checkResult) {
            this.logger.warn(`[readDBTransactionRecords] ${tx.sourceId} optimisticCheckTxStatus failed`)
            continue
          }
          const result = await store.addTransactions(tx as any);
          this.logger.debug(
            `[readDBTransactionRecords] ${tx.sourceId} DB store addTransactions ${JSON.stringify(result)}`
          );
          // if (+tx.id > store.lastId) {
          //   store.lastId = +tx.id;
          // }
        } catch (error) {
          this.logger.error(
            `[readDBTransactionRecords] ${tx.sourceId} handle error`, error
          );
        }
      }
    }
  }

  private async consumeMQTransactionRecords(bridgeTransaction: BridgeTransactionAttributes) {
    this.logger.info(`consumeMQTransactionRecords ${JSON.stringify(bridgeTransaction)}`)
    const chains = this.chainConfigService.getAllChains()
    const targetChainInfo = chains.find(chain => String(chain.chainId) === String(bridgeTransaction.targetChain))
    if (!targetChainInfo) {
      this.logger.warn(`sourceId:${bridgeTransaction.sourceId}, bridgeTransaction does not match the maker or chain, sourceMaker:${bridgeTransaction.sourceMaker}, chainId:${bridgeTransaction.targetChain}`)
    }

    const key = `${bridgeTransaction.targetChain}-${bridgeTransaction.sourceMaker}`.toLocaleLowerCase();
    if (!this.stores.has(key)) {
      this.stores.set(key, new StoreService(bridgeTransaction.targetChain));
    }
    const checkResult = await this.validatorService.optimisticCheckTxStatus(bridgeTransaction.sourceId, bridgeTransaction.sourceChain)
    if (!checkResult) {
      this.logger.warn(`${bridgeTransaction.sourceId} optimisticCheckTxStatus failed`)
      return
    }
    const store = this.stores.get(key)
    const result = await store.addTransactions(bridgeTransaction as any);
    this.logger.debug(
      `${bridgeTransaction.sourceId} MQ store addTransactions ${JSON.stringify(result)}`
    );
    // throw new Error()
  }

  @Cron("*/1 * * * * *")
  private async checkStoreWaitSend() {
    const storeKeys = this.stores.keys();
    for (const k of storeKeys) {
      const store = this.stores.get(k);
      const isDisabledPaid = await this.validatorService.validDisabledPaid(store.chainId);
      if (isDisabledPaid) {
        this.logger.debug(
          `checkStoreWaitSend ${store.chainId} Disabled Paid collection function`
        );
        continue;
      }
      if (!this.storesState[k]) {
        this.storesState[k] = {
          lock: new Mutex(),
          lastSubmit: Date.now(),
        };
      }
      const storesState = this.storesState[k];
      if (storesState.lock.isLocked()) {
        return;
      }
      const TransferInterval =
        this.envConfig.get(`${store.chainId}.TransferInterval`) || 1000;
      if (Date.now() - storesState.lastSubmit >= TransferInterval) {
        const wthData = store.getSymbolsWithData();
        if (wthData.length > 0) {
          this.checkStoreReadySend(k, store);
        }
      }
    }
  }

  private async checkStoreReadySend(key: string, store: StoreService) {
    const lock: Mutex = this.storesState[key].lock;
    if (lock.isLocked()) {
      return;
    }
    const isDisabledPaid = await this.validatorService.validDisabledPaid(store.chainId);
    if (isDisabledPaid) {
      this.logger.debug(
        `checkStoreReadySend ${store.chainId} Disabled Paid collection function`
      );
      return;
    }
    const batchTransferCount = this.validatorService.getPaidTransferCount(store.chainId);
    if (batchTransferCount == -1) {
      this.logger.info(
        `Setting PaidTransferCount to -1 disables sending`
      );
      return;
    }
    lock.runExclusive(async () => {
      this.logger.debug(`checkStoreReadySend ${key}`);
      const wthData = store.getSymbolsWithData();
      for (const row of wthData) {
        const isBatchTransaction =
          row.size >= batchTransferCount && batchTransferCount > 1;
        if (isBatchTransaction) {
          this.logger.debug(
            `checkStoreReadySend ${key} -> batchSendTransaction`
          );
          await this.batchSendTransaction(row.id, store).catch((error) => {
            this.logger.error(
              `checkStoreReadySend ${key} -> batchSendTransaction error`,
              error
            );
          });
        } else {
          this.logger.debug(
            `rowSize:${row.size} batchTransferCount:${batchTransferCount} checkStoreReadySend ${key} -> singleSendTransaction`
          );
          await this.singleSendTransaction(row.id, store).catch((error) => {
            this.logger.error(
              `checkStoreReadySend ${key} -> singleSendTransaction error`,
              error
            );
          });
        }
      }
      this.storesState[key].lastSubmit = Date.now();
    });
  }

  async batchSendTransaction(token: string, store: StoreService) {
    const transfers = await store.getTransactionsByToken(token);
    for (let i = transfers.length - 1; i >= 0; i--) {
      const tx = transfers[i];
      const hash = tx.sourceId;
      if (this.validatorService.transactionTimeValid(tx.sourceChain, tx.sourceTime)) {
        transfers.splice(i, 1);
        store.removeSymbolsWithData(token, hash);
        this.logger.warn(`[batchSendTransaction] ${hash} Exceeding the effective payment collection time failed`)
        continue
      }
      if (await store.isTransfersExist(tx.sourceId)) {
        transfers.splice(i, 1);
        store.removeSymbolsWithData(token, hash);
        this.logger.warn(`[batchSendTransaction] ${hash} There is a collection record`)
        continue
      }
    }

    if (
      !arePropertyValuesConsistent<TransferAmountTransaction>(
        transfers,
        "targetToken"
      )
    ) {
      throw new Error("batchSendTransaction targetToken inconsistent");
    }
    const { result, errors } =
      await this.validatorService.transactionGetPrivateKeys(
        store.chainId,
        token,
        transfers
      );
    if (isEmpty(result) && errors.length > 0) {
      this.logger.error(
        `${token} batchSendTransaction validatorService warn ${JSON.stringify(
          errors || {}
        )}`
      );
      this.alertService.sendMessage(`batchSendTransaction validatorService error: ${JSON.stringify(errors || {})}`, 'TG');
      return;
    }
    const promiseMaps = Object.keys(result).map(async (sender) => {
      const { account, transfers } = result[sender];
      if (transfers.length == 1) {
        const transfer: TransferAmountTransaction = transfers[0];
        return await this.sequencerService.singleSendTransactionByTransfer(
          transfer.targetToken,
          store,
          transfer.sourceId
        );
      }
      if (transfers.length > 0) {
        await this.sequencerService.batchSendTransactionByTransfer(
          token,
          store,
          account,
          transfers
        );
        return;
      }
      return null;
    });
    return await Promise.all(promiseMaps);
  }

  async singleSendTransaction(token: string, store: StoreService) {
    const tokenTxList = await store.getTargetTokenTxIdList(token);
    for (const hash of tokenTxList) {
      const tx = store.getTransaction(hash);
      if (!tx) {
        store.removeSymbolsWithData(token, hash);
        this.logger.warn(`[singleSendTransaction] ${hash} Transaction details do not exist`)
        continue
      }
      if (this.validatorService.transactionTimeValid(tx.sourceChain, tx.sourceTime)) {
        store.removeSymbolsWithData(token, hash);
        this.logger.warn(`[singleSendTransaction] ${hash} Exceeding the effective payment collection time failed`)
        continue
      }
      if (await store.isTransfersExist(tx.sourceId)) {
        store.removeSymbolsWithData(token, hash);
        this.logger.warn(`[singleSendTransaction] ${hash} There is a collection record`)
        continue
      }
      this.sequencerService.singleSendTransactionByTransfer(token, store, hash);
      store.removeSymbolsWithData(token, hash);
    }
  }
}
