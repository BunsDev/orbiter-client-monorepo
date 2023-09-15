import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { Mutex } from "async-mutex";
import { ChainConfigService,ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { SequencerService } from "./sequencer.service";
import { ValidatorService } from "../validator/validator.service";
import {
  type MonitorState,
  type TransferAmountTransaction,
} from "./sequencer.interface";
import { arePropertyValuesConsistent, isEmpty } from "@orbiter-finance/utils";
import { StoreService } from "../store/store.service";
import { Op } from "sequelize";
import { AccountFactoryService } from "../../account/factory";
import dayjs from "dayjs";
import { BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
@Injectable()
export class SequencerScheduleService {
  private readonly logger = new Logger(SequencerService.name);
  private readonly stores = new Map<string, StoreService>(); // chainId + owner
  private storesState: Record<string, MonitorState> = {};

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    @InjectModel(TransfersModel)
    private readonly transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private readonly sequencerService: SequencerService,
    private readonly envConfig: ENVConfigService,
    private readonly consumerService: ConsumerService
  ) {
    this.checkDBTransactionRecords();
    this.logger.log('start consumeBridgeTransactionMessages')
    this.consumerService.consumeBridgeTransactionMessages(this.consumeMQTransactionRecords.bind(this))
    // this.validatorService.validatingValueMatches("ETH", "1", "ETH", "2")
  }

  @Cron("*/5 * * * * *")
  private checkDBTransactionRecords() {
    const owners = this.envConfig.get("MAKERS") || [];
    for (const chain of this.chainConfigService.getAllChains()) {
      for (const owner of owners) {
        // targetChainId + owner
        const key = `${chain.chainId}-${owner}`.toLocaleLowerCase();
        if (!this.stores.has(key)) {
          this.stores.set(key, new StoreService(chain.chainId));
        }
        if (!this.storesState[key]) {
          this.storesState[key] = {
            lock: new Mutex(),
            lastSubmit: Date.now(),
          };
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
    const where = {
        status: 0,
        targetChain: store.chainId,
        sourceMaker: owner,
        id: {
          [Op.gt]: store.lastId,
        },
        sourceTime: {
          [Op.gte]: dayjs().subtract(24, "hour").toISOString(),
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
        const checkResult = await this.validatorService.optimisticCheckTxStatus(tx.sourceId, tx.sourceChain)
        if (!checkResult) {
          this.logger.warn(`${tx.sourceId} optimisticCheckTxStatus failed`)
          continue
        }
        const result = await store.addTransactions(tx as any);
        this.logger.debug(
          `${tx.sourceId} store addTransactions ${JSON.stringify(result)}`
        );
        if (+tx.id > store.lastId) {
          store.lastId = +tx.id;
        }
      }
    }
  }

  private async consumeMQTransactionRecords(bridgeTransaction: BridgeTransactionAttributes) {
    this.logger.log('consumeMQTransactionRecords', JSON.stringify(bridgeTransaction))
    const owners = this.envConfig.get("MAKERS") || [];
    const chains = this.chainConfigService.getAllChains()
    const targetChainInfo = chains.find(chain => String(chain.chainId) === bridgeTransaction.targetChain)
    if (!owners.includes(bridgeTransaction.sourceMaker) || !targetChainInfo) {
      this.logger.warn(`sourceId:${bridgeTransaction.sourceId}, bridgeTransaction does not match the maker or chain, sourceMaker:${bridgeTransaction.sourceMaker}, chainId:${bridgeTransaction.targetChain}`)
    }
    const key = `${bridgeTransaction.targetChain}-${bridgeTransaction.sourceMaker}`.toLocaleLowerCase();
    if (!this.stores.has(key)) {
      this.stores.set(key, new StoreService(bridgeTransaction.targetChain));
    }
    if (!this.storesState[key]) {
      this.storesState[key] = {
        lock: new Mutex(),
        lastSubmit: Date.now(),
      };
    }
    const checkResult = await this.validatorService.optimisticCheckTxStatus(bridgeTransaction.sourceId, bridgeTransaction.sourceChain)
    if (!checkResult) {
      this.logger.warn(`${bridgeTransaction.sourceId} optimisticCheckTxStatus failed`)
      return
    }
    const store = this.stores.get(key)
    const result = await store.addTransactions(bridgeTransaction as any);
    this.logger.debug(
      `${bridgeTransaction.sourceId} store addTransactions ${JSON.stringify(result)}`
    );
    // throw new Error()
  }

  @Cron("*/5 * * * * *")
  private checkStoreWaitSend() {
    const storeKeys = this.stores.keys();
    for (const k of storeKeys) {
      const store = this.stores.get(k);
      const wthData = store.getSymbolsWithData();
      if (wthData.length > 0) {
        this.checkStoreReadySend(k, store);
      }
    }
  }

  private async checkStoreReadySend(key: string, store: StoreService) {
    const batchTransferCount =
      this.envConfig.get(`${store.chainId}.BatchTransferCount`) || 1;
    const lock: Mutex = this.storesState[key].lock;
    if (lock.isLocked()) {
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
              "checkStoreReadySend -> batchSendTransaction error",
              error.stack
            );
          });
        } else {
          this.logger.debug(
            `checkStoreReadySend ${key} -> singleSendTransaction`
          );
          await this.singleSendTransaction(row.id, store).catch((error) => {
            this.logger.error(
              "checkStoreReadySend -> singleSendTransaction error",
              error.stack
            );
          });
        }
      }
      this.storesState[key].lastSubmit = Date.now();
    });
  }

  async batchSendTransaction(token: string, store: StoreService) {
    const transfers = await store.getTransactionsByToken(token);
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
        `${token} batchSendTransaction transactionGetPrivateKeys warn ${JSON.stringify(
          errors || {}
        )}`
      );
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
      this.sequencerService.singleSendTransactionByTransfer(token, store, hash);
    }
  }
}
