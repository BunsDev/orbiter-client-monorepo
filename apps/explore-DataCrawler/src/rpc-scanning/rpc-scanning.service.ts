import winston from 'winston';
import { TransferAmountTransaction } from '../transaction/transaction.interface';
import { IChainConfig } from '@orbiter-finance/config';
import { Block, Context, RetryBlockRequestResponse, TransactionReceipt, TransactionResponse } from './rpc-scanning.interface';
import { equals, isEmpty, promiseWithTimeout } from '@orbiter-finance/utils';
import { logger } from '@orbiter-finance/utils';
import DataProcessor from '../utils/dataProcessor';

// Define the RPC scanning interface
export interface RpcScanningInterface {
  init(): Promise<void>;
  executeCrawlBlock(): Promise<any[]>;
  checkLatestHeight(): Promise<any>;
  manualScanBlocks(blockNumbers: number[]): Promise<any>;
}

export class RpcScanningService implements RpcScanningInterface {
  public logger: winston.Logger;
  public rpcLastBlockNumber: number = 0;
  protected requestTimeout = 1000 * 20;
  readonly dataProcessor: DataProcessor;

  constructor(
    public readonly chainId: string,
    public readonly ctx: Context,
  ) {
    this.logger = logger.createLoggerByName(`rpcscan-${this.chainId}`, {
      label: this.chainConfig.name
    });
    this.dataProcessor = new DataProcessor(this.chainId, this.logger);
  }
  get targetConfirmation() {
    return Number(this.chainConfig.targetConfirmation || this.ctx.envConfigService.get('TargetConfirmation') || 5);
  }
  get batchLimit(): number {
    return Number(this.chainConfig['batchLimit'] || this.ctx.envConfigService.get('DefaultBatchLimit') || 100);
  }

  get chainConfig(): IChainConfig {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }

  async init() {
    // TODO: Implement initialization logic if needed.
  }

  async executeCrawlBlock() {
    const blockNumbers = await this.dataProcessor.getProcessNextBatchData(this.batchLimit);
    const nextScanMaxBlockNumber = await this.dataProcessor.getNextScanMaxBlockNumber();
    if (blockNumbers.length <= 0) {
      if (Date.now() % 5) {
        this.chainConfig.debug && this.logger.debug('executeCrawlBlock: No block numbers to process.');
      }
      return [];
    }
    if (Date.now() % 1000 * 10 === 0) {
      this.dataProcessor.getDataByStorage().then(data => {
        this.chainConfig.debug && this.logger.debug(`getDataByStorage data ${JSON.stringify(data)}`);
      })
    }
    this.logger.info(
      `${this.chainConfig.name} blockNumbersLength:${blockNumbers.length}, total: ${this.dataProcessor.getDataCount()} batchLimit:${this.batchLimit}, nextScanMaxBlockNumber: ${nextScanMaxBlockNumber}, rpcLastBlockNumber: ${this.rpcLastBlockNumber}`,
    );
    this.chainConfig.debug && this.logger.debug(
      `${this.chainConfig.name} blockNumbers:${JSON.stringify(blockNumbers)}`,
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
            this.chainConfig.debug && this.logger.debug(`scanByBlocks success ${block.number} processTransaction ${transfers.length}`);
            await this.processTransaction(error, block, transfers);
            acks.push(block.number);
          } catch (error) {
            noAcks.push(block.number);
            this.logger.error(
              `executeCrawlBlock: handleScanBlockResult ${block.number} error`,
              error,
            );
          }
        } else {
          noAcks.push(block.number);
          this.logger.error(`scanByBlocks: Block error Block: ${block.number} ${error.message}`);
        }
      },
    ).catch(error => {
      this.dataProcessor.noAck(blockNumbers);
      throw error;
    });
    this.chainConfig.debug && this.logger.debug(`executeCrawlBlock: Ack ${JSON.stringify(acks)}, NoAck ${noAcks}`);
    if (noAcks.length > 0) {
      this.dataProcessor.noAck(noAcks);
    }
    if (acks.length > 0) {
      await this.dataProcessor.ack(acks);
    }

    this.logger.info(`${this.chainConfig.name} executeCrawlBlock: Execution completed`);
    return result;
  }

  async checkLatestHeight(): Promise<any> {
    try {
      const firstStart = isEmpty(this.rpcLastBlockNumber);
      this.rpcLastBlockNumber = await promiseWithTimeout(this.getLatestBlockNumber(), 1000 * 20);
      if (isEmpty(this.rpcLastBlockNumber)) {
        throw new Error('checkLatestHeight getLatestBlockNumber returned empty value.');
      }

      let lastScannedBlockNumber = await this.dataProcessor.getNextScanMaxBlockNumber();
      if (!lastScannedBlockNumber) {
        lastScannedBlockNumber = this.rpcLastBlockNumber - this.batchLimit;
        this.logger.info(`checkLatestHeight Initialize ${lastScannedBlockNumber} blocks, lastBlock ${this.rpcLastBlockNumber}`)
        this.dataProcessor.changeMaxScanBlockNumber(lastScannedBlockNumber);
      }

      if (firstStart) {
        const newLastScannedBlockNumber = lastScannedBlockNumber > this.batchLimit ? lastScannedBlockNumber - this.batchLimit : lastScannedBlockNumber;
        this.logger.info(`checkLatestHeight restart app, go back ${lastScannedBlockNumber} change ${newLastScannedBlockNumber} blocks, lastBlock ${this.rpcLastBlockNumber}`)
        lastScannedBlockNumber = newLastScannedBlockNumber;
      }
      const safetyBlockNumber = this.rpcLastBlockNumber - this.targetConfirmation;
      this.chainConfig.debug && this.logger.debug(
        `${this.chainConfig.name} checkLatestHeight Checking - Target Confirmation: ${this.targetConfirmation}, lastScannedBlockNumber: ${lastScannedBlockNumber}, safetyBlockNumber: ${safetyBlockNumber}, rpcLastBlockNumber: ${this.rpcLastBlockNumber}, batchLimit: ${this.batchLimit}, nextScanBlock: ${await this.dataProcessor.getNextScanMaxBlockNumber()}`,
      );

      if (safetyBlockNumber >= lastScannedBlockNumber) {
        const blockNumbers = await this.dataProcessor.createRangeScanData(lastScannedBlockNumber, safetyBlockNumber);
        this.chainConfig.debug && this.logger.debug(`createRangeScanData ${blockNumbers.length}/count ${JSON.stringify(blockNumbers)}`);
        return blockNumbers;
      }
    } catch (error) {
      this.logger.error(`checkLatestHeight error - ${error}`);
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
            await this.processTransaction(error, block, transfers);
          }
        },
      );
      return response;
    } catch (error) {
      this.logger.error(`manualScanBlocks: Error - ${error}`);
    }
  }

  protected async processTransaction(
    error: Error,
    block: RetryBlockRequestResponse,
    transfers: TransferAmountTransaction[],
  ) {
    await this.ctx.transactionService.handleTransfer(transfers);
    return { error, block, transfers };
  }

  protected async isWatchAddress(address: string) {
    return await this.ctx.transactionService.isWatchAddress(address);
  }

  protected async filterTransfers(transfers: TransferAmountTransaction[]) {
    const newList = [];
    for (const transfer of transfers) {
      const senderValid = await this.isWatchAddress(transfer.sender);
      if (senderValid) {
        newList.push(transfer);
        continue;
      }
      const receiverValid = await this.isWatchAddress(transfer.receiver);
      if (receiverValid) {
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
      throw new Error('scanByBlocks: Missing block numbers.');
    }

    const blocksResponse = await this.getBlocks(blockNumbers);
    const processBlock = async (row: RetryBlockRequestResponse) => {
      try {
        if (isEmpty(row) || row.error) {
          await callbackFun(row.error, row, []);
          this.logger.error(
            `handleBlock error: Chain ${this.chainId}, Block ${row.number}`,
            row.error,
          );
          return { block: row, transfers: [], error: row.error };
        }

        const result: TransferAmountTransaction[] = await this.handleBlock(
          row.block,
        );
        const transfers = await this.filterTransfers(result);
        this.chainConfig.debug && this.logger.debug(
          `handleBlock success - Block: ${row.number}, Matched: ${transfers.length}/${result.length}`,
        );
        await callbackFun(null, row, transfers);
        return { block: row, transfers: transfers };
      } catch (error) {
        await callbackFun(error, row, null);
        this.logger.error(
          `handleBlock catch error - Chain ${this.chainId}, Block ${row.number}`,
          error,
        );
        return { block: row, transfers: [], error };
      }
    };

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
    const result = {
      number: blockNumber,
      block: null,
      error: null,
    };
    for (let retry = 1; retry <= retryCount; retry++) {
      try {
        const data: Block | null = await promiseWithTimeout(this.getBlock(blockNumber), timeoutMs);
        if (!isEmpty(data)) {
          result.error = null;
          result.block = data;
          break;
        }
      } catch (error) {
        this.logger.error(
          `${this.chainConfig.name} retryBlockRequest error ${retry}/${retryCount} - Block:${blockNumber}`,
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
      const data = await promiseWithTimeout(this.getTransactionReceipt(hash), timeoutMs);
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
      throw new Error('Missing hash parameter');
    }
    const result = {
      hash: hash,
      data: null,
      error: null,
    };
    for (let retry = 1; retry <= retryCount; retry++) {
      try {
        const data = await this.requestTransactionReceipt(hash, timeoutMs);
        if (data) {
          result.data = data;
          result.error = null;
          break;
        }
      } catch (error) {
        this.logger.error(
          `retryRequestGetTransactionReceipt error ${retry}/${retryCount} - Hash:${hash}`,
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
    let contractInfo = this.chainConfig.contracts.find(c => equals(c.address, toAddress));
    if (!contractInfo && this.chainConfig.contract) {
      for (const [addr, name] of Object.entries(this.chainConfig.contract)) {
        if (equals(addr, toAddress)) {
          contractInfo = { address: addr, name };
          break;
        }
      }
    }
    return contractInfo;
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
