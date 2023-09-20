import {
  RpcScanningInterface,
  RetryBlockRequestResponse,
  TransferAmountTransaction,
  Block,
  TransactionReceipt,
  TransactionResponse,
  Context,
} from './rpc-scanning.interface';
import { IChainConfig } from '@orbiter-finance/config';
import { isEmpty, sleep, equals, promiseWithTimeout } from '@orbiter-finance/utils';
import { createLoggerByName } from '../utils/logger';
import winston from 'winston';
import DataProcessor from '../utils/dataProcessor';
import bluebird from 'bluebird'
export class RpcScanningService implements RpcScanningInterface {
  public logger: winston.Logger;
  public rpcLastBlockNumber: number = 0;
  protected requestTimeout = 1000 * 60 * 5;
  readonly dataProcessor: DataProcessor;
  constructor(
    public readonly chainId: string, public readonly ctx: Context
  ) {
    this.logger = createLoggerByName(`rpcscan-${this.chainId}`, {
      label: this.chainConfig.name
    });
    this.dataProcessor = new DataProcessor(this.chainId);
  }
  get batchLimit():number {
    return this.chainConfig['batchLimit'] || 100;
  }
  get chainConfig(): IChainConfig {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }
  async init() {
  }
  async executeCrawlBlock() {
    const blockNumbers = await this.dataProcessor.getProcessNextBatchData(100);
    if (blockNumbers.length <= 0) {
      this.logger.info('executeCrawlBlock not blockNumbers');
      return [];
    }
    this.logger.debug(
      `executeCrawlBlock process,blockNumbersLength:${blockNumbers.length}, blockNumbers:${JSON.stringify(blockNumbers)} batchLimit:${this.batchLimit}`,
    );
    const noAcks = [];
    const acks = [];
    const result = await this.scanByBlocks(
      blockNumbers,
      async (
        error: Error,
        block: RetryBlockRequestResponse,
        transfers: TransferAmountTransaction[],
      ) => {
        if (isEmpty(error) && transfers) {
          try {
            await this.handleScanBlockResult(error, block, transfers);
            acks.push(block.number);
          } catch (error) {
            noAcks.push(block.number);
            this.logger.error(
              `executeCrawlBlock handleScanBlockResult ${block.number} error`,
              error,
            );
          }
        } else {
          noAcks.push(block.number);
          this.logger.error(`scanByBlocks block error Block: ${block.number} ${error.message}`)
        }
      },
    );
    noAcks.length > 0 && this.dataProcessor.noAck(noAcks);
    acks.length > 0 && await this.dataProcessor.ack(acks);
    this.logger.info('executeCrawlBlock end');
    return result;
  }

  async checkLatestHeight(): Promise<any> {
    try {
      const firstStart = isEmpty(this.rpcLastBlockNumber);
      this.rpcLastBlockNumber = await promiseWithTimeout(this.getLatestBlockNumber(), 1000 * 20);
      if (isEmpty(this.rpcLastBlockNumber)) {
        throw new Error('checkLatestHeight getLatestBlockNumber empty');
      }
      let lastScannedBlockNumber = await this.dataProcessor.getMaxScanBlockNumber();
      if (lastScannedBlockNumber && lastScannedBlockNumber>0) {
        lastScannedBlockNumber+=1;
      } else {
        lastScannedBlockNumber = this.rpcLastBlockNumber - this.batchLimit;
        this.dataProcessor.changeMaxScanBlockNumber(lastScannedBlockNumber);
      }
      if (firstStart) {
        lastScannedBlockNumber = lastScannedBlockNumber>this.batchLimit ? lastScannedBlockNumber -this.batchLimit : lastScannedBlockNumber;
      }
      const targetConfirmation = +this.chainConfig.targetConfirmation || 3;
      const safetyBlockNumber = this.rpcLastBlockNumber - targetConfirmation;
      this.chainConfig.debug && this.logger.debug(
        `checkLatestHeight check ${targetConfirmation}/lastScannedBlockNumber=${lastScannedBlockNumber}/safetyBlockNumber=${safetyBlockNumber}/rpcLastBlockNumber=${this.rpcLastBlockNumber}, batchLimit:${this.batchLimit}`,
      );
      if (safetyBlockNumber > lastScannedBlockNumber) {
        const blockNumbers = await this.dataProcessor.createRangeScannData(lastScannedBlockNumber,safetyBlockNumber )
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
        newList.push(transfer);
        continue;
      }
      const receiverValid = await this.ctx.makerService.isWhiteWalletAddress(transfer.receiver);
      if (receiverValid.exist) {
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
    const blocksResponse = await this.getBlocks(blockNumbers);
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
        callbackFun(null, row, transfers);
        return { block: row, transfers: transfers };
      } catch (error) {
        callbackFun(error, row, null);
        this.logger.error(
          `${this.chainId} handleBlock  error ${row.number} `,
          error,
        );
        return { block: row, transfers: [], error };
      }
    };
    const result = bluebird.map(blocksResponse, processBlock, { concurrency: 10 })
    // const result = await Promise.all(blocksResponse.map(processBlock));
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
