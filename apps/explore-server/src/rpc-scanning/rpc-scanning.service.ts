import { readFileSync, outputFile } from 'fs-extra';
import {
  RpcScanningInterface,
  RetryBlockRequestResponse,
  TransferAmountTransaction,
  Block,
  TransactionReceipt,
  TransactionResponse,
  Context,
} from './rpc-scanning.interface';
import { Level } from 'level';
import { IChainConfig } from '@orbiter-finance/config';
import { isEmpty, sleep, equals, take, generateSequenceNumbers, promiseWithTimeout, JSONStringify } from '@orbiter-finance/utils';
import { Mutex } from 'async-mutex';
import { createLoggerByName } from '../utils/logger';
import winston from 'winston';
import { ethers } from 'ethers6';
export class RpcScanningService implements RpcScanningInterface {
  // protected db: Level;
  public logger: winston.Logger;
  public rpcLastBlockNumber: number;
  protected batchLimit = 100;
  protected requestTimeout = 1000 * 60 * 5;
  private pendingDBLock = new Mutex();
  private pendingScanBlocks: Set<number> = new Set();
  // private blockInProgress: Set<number> = new Set();
  static levels: { [key: string]: Level } = {};
  constructor(
    public readonly chainId: string, public readonly ctx: Context
  ) {
    if (!RpcScanningService.levels[chainId]) {
      const db = new Level(`./runtime/data/${this.chainId}`);
      RpcScanningService.levels[chainId] = db;
    }
    if (chainId) {
      this.logger = createLoggerByName(`rpcscan-${this.chainId}`, {
        label: this.chainConfig.name
      });
      this.init();
    }
  }
  get chainConfig(): IChainConfig {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }
  async init() {
    const blockNumbers = await this.getStoreWaitScanBlocks(-1);
    for (const block of blockNumbers) {
      this.pendingScanBlocks.add(Number(block));
    }
    console.log(this.chainConfig.name, 'getStoreWaitScanBlocks', blockNumbers);
  }
  getDB() {
    return RpcScanningService.levels[this.chainId];
  }
  async getMemoryWaitScanBlockNumbers(limit = -1) {
    if (limit > 0) {
      return take(Array.from(this.pendingScanBlocks), limit).map(n => +n);
    } else {
      return Array.from(this.pendingScanBlocks).map(n => +n);
    }
  }
  async getStoreWaitScanBlocks(limit = -1) {
    const db = this.getDB();
    const subDB = db.sublevel('pending-scan');
    if (limit > 0) {
      return await subDB.keys({ limit: limit }).all();
    } else {
      return await subDB.keys().all();
    }
  }

  async executeCrawlBlock() {
    try {

      const blockNumbers = await this.getMemoryWaitScanBlockNumbers(this.batchLimit);
      // for (const blockNum of blockNumbers) {
      //   this.blockInProgress.add(blockNum);
      // }
      if (blockNumbers.length <= 0) {
        this.logger.info('executeCrawlBlock not blockNumbers');
        return [];
      }
      this.logger.debug(
        `executeCrawlBlock process,blockNumbersLength:${blockNumbers.length}, blockNumbers:${JSON.stringify(blockNumbers)} batchLimit:${this.batchLimit}`,
      );
      const result = await this.scanByBlocks(
        blockNumbers,
        async (
          error: Error,
          block: RetryBlockRequestResponse,
          transfers: TransferAmountTransaction[],
        ) => {
          // this.blockInProgress.delete(block.number);
          // this.logger.info(`delete blockInProgress: ${block.number}, status: ${(transfers && isEmpty(error))}`)
          if (isEmpty(error) && transfers) {
            try {
              // this.logger.debug(
              //   `[failedREScan] RPCScan success block:${block.number}, match:${transfers.length}`,
              // );
              await this.handleScanBlockResult(error, block, transfers);
              await this.delPendingScanBlocks([block.number]);
            } catch (error) {
              this.logger.error(
                `executeCrawlBlock handleScanBlockResult ${block.number} error`,
                error,
              );
            }
          } else {
            this.logger.error(`scanByBlocks block error Block: ${block.number} ${JSONStringify(error)}`)
          }
        },
      );
      this.logger.info('executeCrawlBlock end');
      return result;
    } catch (error) {
      this.logger.error(`executeCrawlBlock error`, error);
    }
  }

  async checkLatestHeight(): Promise<any> {
    try {
      const blockHeight = await promiseWithTimeout(this.getLatestBlockNumber(), 1000 * 20);
      if (isEmpty(blockHeight)) {
        throw new Error('checkLatestHeight getLatestBlockNumber empty');
      }
      this.rpcLastBlockNumber = this.rpcLastBlockNumber === 0 && blockHeight > this.batchLimit ? blockHeight - this.batchLimit : blockHeight;
      const lastScannedBlockNumber = await this.getLastScannedBlockNumber();
      const targetConfirmation = +this.chainConfig.targetConfirmation || 3;
      const safetyBlockNumber = this.rpcLastBlockNumber - targetConfirmation;
      this.chainConfig.debug && this.logger.debug(
        `checkLatestHeight check ${targetConfirmation}/lastScannedBlockNumber=${lastScannedBlockNumber}/safetyBlockNumber=${safetyBlockNumber}/rpcLastBlockNumber=${this.rpcLastBlockNumber}, batchLimit:${this.batchLimit}`,
      );
      if (safetyBlockNumber > lastScannedBlockNumber) {
        const blockNumbers = generateSequenceNumbers(
          lastScannedBlockNumber,
          safetyBlockNumber,
        );
        const endBlockNumber = blockNumbers[blockNumbers.length - 1];
        await this.setPendingScanBlocks(blockNumbers);
        await this.setLastScannedBlockNumber(endBlockNumber);
        return blockNumbers;
      }
    } catch (error) {
      this.logger.error(`checkLatestHeight error `, error);
    }
  }
  public async manualScanBlocks(blockNumbers: number[]): Promise<any> {
    try {
      let response = [];
      await this.scanByBlocks(
        blockNumbers,
        async (
          error: Error,
          block: RetryBlockRequestResponse,
          transfers: TransferAmountTransaction[],
        ) => {
          if (transfers && isEmpty(error)) {
            response = transfers;
            await this.handleScanBlockResult(error, block, transfers);
            await this.delPendingScanBlocks([block.number]);
          }
        },
      );
      return response;
    } catch (error) {
      this.logger.error(`manualScanBlocks error`, error);
    }
  }

  protected async handleScanBlockResult(
    error: Error,
    block: RetryBlockRequestResponse,
    transfers: TransferAmountTransaction[],
  ) {
    if (transfers && isEmpty(error)) {
      await this.ctx.transactionService.execCreateTransactionReceipt(transfers);
    }
    return { error, block, transfers };
  }
  protected async filterTransfers(transfers: TransferAmountTransaction[]) {
    const newList = [];
    for (const transfer of transfers) {
      const senderValid = await this.ctx.makerService.isWhiteWalletAddress(transfer.sender);
      if (senderValid.exist) {
        // transfer.version = senderValid.version;
        newList.push(transfer);
        continue;
      }
      const receiverValid = await this.ctx.makerService.isWhiteWalletAddress(transfer.receiver);
      if (receiverValid.exist) {
        // transfer.version = receiverValid.version;
        newList.push(transfer);
        continue;
      }
    }
    return newList;
  }
  public async scanByBlocks(
    blockNumbers: number[],
    callbackFun: (
      error: Error,
      data: any,
      transfers: TransferAmountTransaction[],
    ) => Promise<any>,
  ): Promise<{ block: any; transfers: any }[]> {
    if (blockNumbers.length <= 0) {
      throw new Error('scanByBlocks missing block number');
    }
    // const startTime = Date.now();
    const blocksResponse = await this.getBlocks(blockNumbers);
    // const endTime = Date.now();

    const processBlock = async (row: RetryBlockRequestResponse) => {
      try {
        if (isEmpty(row) || row.error) {
          callbackFun(row.error, row, []);
          return { block: row, transfers: [], error: row.error };
        }
        const result: TransferAmountTransaction[] = await this.handleBlock(
          row.block,
        );
        const transfers = await this.filterTransfers(result);
        this.logger.debug(
          `RPCScan handle block success block:${row.number}, match:${transfers.length}/${result.length}`,
        );
        await callbackFun(null, row, transfers);

        return { block: row, transfers: transfers };
      } catch (error) {
        await callbackFun(error, row, null);
        this.logger.error(
          `${this.chainId} handleBlock  error ${row.number} `,
          error,
        );
        return { block: row, transfers: [], error };
      }
    };

    // const successBlock = blocksResponse.filter((row) => isEmpty(row.error));
    // const failBlock = blocksResponse.filter((row) => !isEmpty(row.error));
    const result = await Promise.all(blocksResponse.map(processBlock));

    return result;
  }
  public getBlocks(
    blockNumbers: number[],
  ): Promise<RetryBlockRequestResponse[]> {
    const blockPromises = blockNumbers.map((blockNumber) =>
      this.retryBlockRequest(blockNumber),
    );
    return Promise.all(blockPromises);
  }

  protected async retryBlockRequest(
    blockNumber: number,
    retryCount = 2,
    timeoutMs: number = this.requestTimeout,
  ): Promise<RetryBlockRequestResponse> {
    let result = {
      number: blockNumber,
      block: null,
      error: null,
    };
    for (let retry = 1; retry <= retryCount; retry++) {
      try {
        // const startTime = Date.now();
        // this.logger.debug(`start scan ${blockNumber}`, 'retryBlockRequest');
        const data: Block | null = await Promise.race([
          this.getBlock(blockNumber),
          sleep(timeoutMs).then(() => {
            throw new Error('Block request timed out');
          }),
        ]);
        if (!isEmpty(data)) {
          result.error = null;
          result.block = data;
          break;
        }
      } catch (error) {
        this.logger.error(
          `retryBlockRequest error ${retry}/${retryCount} block:${blockNumber} `,
          error,
        );
        if (retry >= retryCount) {

          result.error = error;
          result.block = null;
        }
      }
    }
    return result;
  }

  async requestTransactionReceipt(hash: string, timeoutMs: number) {
    try {
      const data = await Promise.race([
        this.getTransactionReceipt(hash),
        sleep(timeoutMs).then(() => {
          throw new Error('RequestTransactionReceipt request timed out');
        }),
      ]);
      return data;
    } catch (error) {
      throw new Error(
        `Failed to request transaction receipt: ${error.message}`,
      );
    }
  }

  async retryRequestGetTransactionReceipt(
    hash: string,
    retryCount = 2,
    timeoutMs = this.requestTimeout,
  ) {
    if (isEmpty(hash)) {
      throw new Error('Missing hash parameter')
    }
    const result = {
      hash: hash,
      data: null,
      error: null,
    };

    for (let retry = 1; retry <= retryCount; retry++) {
      try {
        // const startTime = Date.now();
        const data = await this.requestTransactionReceipt(hash, timeoutMs);
        if (data) {
          result.data = data;
          result.error = null;
          break;
        }
        // if (retry > 1) {
        //   this.logger.debug(
        //     `[2-Single] retryRequestGetTransactionReceipt ${retry}/${retryCount} hash:${hash}, time consuming:${
        //       (Date.now() - startTime) / 1000
        //     }/s`,
        //   );
        // }
      } catch (error) {
        this.logger.error(
          `retryRequestGetTransactionReceipt error ${retry}/${retryCount} hash:${hash} `,
          error,
        );
        if (retry >= retryCount) {

          result.error = error.message;
        }
      }
    }

    return result;
  }

  protected async setLastScannedBlockNumber(
    blockNumber: number,
  ): Promise<void> {
    // await this.db.put("LastScannedBlockNumber", blockNumber.toString());
    await this.pendingDBLock.runExclusive(async () => {
      return await outputFile(
        `runtime/scan/${this.chainId}`,
        blockNumber.toString(),
      );
    });
  }

  public async getLastScannedBlockNumber(): Promise<number> {
    let lastScannedBlockNumber;
    try {
      lastScannedBlockNumber = +readFileSync(`runtime/scan/${this.chainId}`);
    } catch (error) {
      this.logger.error(
        `getLastScannedBlockNumber error`,
        error,
      );
    } finally {
      if (!lastScannedBlockNumber) {
        lastScannedBlockNumber = await this.getLatestBlockNumber();
        await this.setLastScannedBlockNumber(lastScannedBlockNumber);
      }
    }
    return lastScannedBlockNumber;
  }
  protected async setPendingScanBlocks(blockNumber: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      return this.pendingDBLock.runExclusive(async () => {
        try {
          const db = this.getDB();
          const subDB = db.sublevel('pending-scan');
          const result = await subDB.batch(
            blockNumber.map((num) => {
              return {
                type: 'put',
                key: num.toString(),
                value: '',
              };
            }),
          );
          for (const num of blockNumber) {
            this.pendingScanBlocks.add(num)
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  protected async delPendingScanBlocks(blockNumber: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingDBLock.runExclusive(async () => {
        try {
          const db = this.getDB();
          const subDB = db.sublevel('pending-scan');
          const result = await subDB.batch(
            blockNumber.map((num) => {
              return {
                type: 'del',
                key: num.toString(),
              };
            }),
          );
          for (const num of blockNumber) {
            this.pendingScanBlocks.delete(num)
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  protected getChainConfigToken(address: string) {
    return this.ctx.chainConfigService.getTokenByChain(
      String(this.chainId),
      address,
    );
  }
  protected getChainConfigContract(toAddress: string) {
    if (this.chainConfig.contract) {
      for (const [addr, name] of Object.entries(this.chainConfig.contract)) {
        if (equals(addr, toAddress)) {
          return { contract: addr, name };
        }
      }
    }
  }

  async getLatestBlockNumber(): Promise<number> {
    throw new Error(
      `${this.chainId} getLatestBlockNumber method not implemented`,
    );
  }

  async handleTransaction(
    _transaction: TransactionResponse,
    _receipt?: TransactionReceipt,
  ): Promise<TransferAmountTransaction[] | null> {
    throw new Error(`${this.chainId} handleTransaction method not implemented`);
  }

  async getBlock(_blockNumber: number): Promise<any> {
    throw new Error(`${this.chainId} getBlock method not implemented`);
  }
  async getTransactionReceipt(_hash: string): Promise<any> {
    throw new Error(
      `${this.chainId} getTransactionReceipt method not implemented`,
    );
  }
  async handleBlock(_block: Block): Promise<TransferAmountTransaction[]> {
    throw new Error(`${this.chainId} handleBlock method not implemented`);
  }
}
