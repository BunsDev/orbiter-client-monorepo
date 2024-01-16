import { Level } from 'level';
import { BridgeTransaction } from "@orbiter-finance/seq-models";
import { Mutex } from "async-mutex";
import { cloneDeep } from "lodash";
import { JSONStringify } from '@orbiter-finance/utils';
import Keyv from 'keyv';
import dayjs from 'dayjs';
export class StoreService {
  // private static readonly levels = new Map<string, Level>();
  private readonly symbolRelHash = new Map<string, Set<string>>();
  private readonly transactions = new Map<string, BridgeTransaction>(); // key = symbol
  // public lastId = 0;
  public static WalletLock: Record<string, Mutex> = {}; // key = chainId + address
  private cache:Keyv;
  constructor(public readonly chainId: string) {
    this.cache = new Keyv(`sqlite://./runtime/db/${dayjs().month() + 1}-${chainId}.sqlite`);
    this.cache.on('error', (error) => {
      console.error('Failed to initialize cache：', error)
      throw new Error('')
    });
    // if (!StoreService.levels.has(chainId)) {
    //   StoreService.levels.set(
    //     chainId,
    //     new Level(`./runtime/${chainId}`)
    //   );
    // }
  }

  public async accountRunExclusive(
    address: string,
    callback: () => Promise<any>
  ) {
    address = address.toLocaleLowerCase();
    const key = `${this.chainId}-${address}`.toLocaleLowerCase();
    if (!StoreService.WalletLock[key]) {
      StoreService.WalletLock[key] = new Mutex();
    }
    const mutex = StoreService.WalletLock[key];
    return await mutex.runExclusive(callback);
  }

  public async getSerialRecord(serialId: string) {
    try {
      // const level = StoreService.levels.get(this.chainId);
      // const data = await level.get(serialId);
      return await this.cache.get(serialId);
      // return data;
    } catch (error) {
      return null;
    }
  }


  public async setSerialRecord(key: string, value: string) {
    // const level = StoreService.levels.get(this.chainId);
    // return await level.put(key, value);
    return await this.cache.set(key, value);
  }

  public async deleteSerialRecord(hash: string) {
    // const level = StoreService.levels.get(this.chainId);
   return await this.cache.delete(hash);
    // await level.del(hash);
  }

  public async removeTransactionAndSetSerial(
    token: string,
    hash: string,
    targeId?: string
  ): Promise<any> {
    const transfer = this.getTransaction(hash);
    if (!transfer) {
      throw new Error(`${hash} transfer not found`)
    }
    const rollback = async () => {
      await this.deleteSerialRecord(hash);
      const result = await this.addTransactions(transfer);
      console.info(`${transfer.sourceId} removeTransactionAndSetSerial rollback result: ${JSONStringify(result)}`);
    };
    try {
      await this.removeTransaction(token, hash);
      await this.setSerialRecord(hash, targeId || "1");
      return {
        rollback,
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  }

  public async removeTransactionsAndSetSerial(
    token: string,
    hashs: string[],
    _targeId?: string
  ): Promise<any> {
    const bakTransfers = hashs.map((id) => this.getTransaction(id));
    if (bakTransfers.length != hashs.length) {
      throw new Error("The deleted data has inconsistent length");
    }
    const rollback = async () => {
      while (bakTransfers.length > 0) {
        const transfer = bakTransfers.splice(0, 1);
        await this.addTransactions(transfer[0]);
        await this.deleteSerialRecord(transfer[0].sourceId);
      }
    };
    const commitTransfers = cloneDeep(bakTransfers);
    const commit = async () => {
      while (commitTransfers.length > 0) {
        const transfer = commitTransfers.splice(0, 1);
        await this.removeTransaction(token, transfer[0].sourceId);
        await this.setSerialRecord(transfer[0].sourceId, "1");
      }
    };
    try {
      await commit();
      return {
        rollback,
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  }


  public async saveSerialRelTxHash(ids: string[], txHash: string) {
    // const batchData = [];
    // const level = StoreService.levels.get(this.chainId);
    for (const id of ids) {
      // batchData.push({ type: "put", key: id, value: txHash });
      await this.cache.set(id, txHash);
    }
    // return await level.batch(batchData);
  }
  public async isTransfersExist(sourceId: string) {
    const data = await this.getSerialRecord(sourceId);
    if (data) {
      // throw new Error(`${tx.sourceId} Payment has already been refunded`);
      return true;
    }
    return false;
  }
  public async isStoreExist(sourceId: string, targetToken: string) {
    const key = `${targetToken}`.toLocaleLowerCase();
    if (this.symbolRelHash.get(key) && this.symbolRelHash.get(key).has(sourceId)) {
      return true;
    }
    return false;
  }
  public async addTransactions(tx: BridgeTransaction) {
    const key = `${tx.targetToken}`.toLocaleLowerCase();
    if (!this.symbolRelHash.has(key)) {
      this.symbolRelHash.set(key, new Set());
    }
    if (await this.isStoreExist(tx.sourceId, tx.targetToken)) {
      return { code: "-1", errmsg: `${tx.sourceId} exist` };
    }
    // Payment has already been refunded
    if (await this.isTransfersExist(tx.sourceId)) {
      // throw new Error(`${tx.sourceId} Payment has already been refunded`);
      return {
        code: "-1",
        errmsg: `${tx.sourceId} Payment has already been refunded`,
      };
    }
    this.symbolRelHash.get(key).add(tx.sourceId);
    this.transactions.set(tx.sourceId, tx);
    return { code: 0, errmsg: "success" };
  }

  public async removeTransaction(token: string, hash: string) {
    this.symbolRelHash.get(token.toLocaleLowerCase()).delete(hash);
    this.transactions.delete(hash);
  }

  public getTargetTokenTxIdList(token: string) {
    const key = `${token}`.toLocaleLowerCase();
    return this.symbolRelHash.get(key).values();
  }

  public getTransactionsByToken(token: string) {
    const tokenTxList = this.getTargetTokenTxIdList(token);
    const transfers = Array.from(tokenTxList).map((hash) =>
      this.getTransaction(hash)
    );
    return transfers;
  }

  public getTransactions() {
    return this.transactions.values();
  }

  public getTransaction(id: string) {
    return this.transactions.get(id);
  }

  public getSymbolsWithData() {
    return Array.from(this.symbolRelHash.keys())
      .map((k) => {
        return {
          id: k,
          size: this.symbolRelHash.get(k).size,
        };
      })
      .filter((row) => row.size > 0);
  }

  public removeSymbolsWithData(token: string, hash: string) {
    this.symbolRelHash.get(token.toLocaleLowerCase()).delete(hash);
  }
}
