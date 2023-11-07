import * as ethers from 'ethers6';
import { Mutex } from 'async-mutex';
import { RpcScanningService } from './rpc-scanning.service';
import { ChainConfigService } from '@orbiter-finance/config';
import { TransactionService } from '../transaction/transaction.service';
import { TransferAmountTransaction } from '../transaction/transaction.interface';

export type Block = any;

export interface TransactionResponse {

};
export interface TransactionReceipt {

};
ethers.TransactionReceipt
export interface RpcScanningInterface {
  getLatestBlockNumber(): Promise<number>;
  handleBlock(block: Block): Promise<TransferAmountTransaction[]>;
  handleTransaction(
    transaction: TransactionResponse,
    receipt?: TransactionReceipt,
  ): Promise<TransferAmountTransaction[] | null>;
  getBlock(blockNumber: number): Promise<Block>;
  getTransactionReceipt(hash: string): Promise<TransactionReceipt>;
}
export interface EVMRpcScanningInterface extends RpcScanningInterface {
  getTransferFee(
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): Promise<string>;
}
export interface RpcScanningScheduleService {
  id: string;
  type: string;
  mutex: Mutex;
  reScanMutex: Mutex;
  service: RpcScanningService;
}
export interface RetryBlockRequestResponse {
  error: Error | null;
  number: number;
  block: Block | null;
}

export interface Context {
   chainConfigService: ChainConfigService,
   transactionService: TransactionService
}