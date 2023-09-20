import * as ethers from 'ethers6';
import { Mutex } from 'async-mutex';
import { RpcScanningService } from './rpc-scanning.service';
import { ChainConfigService } from '@orbiter-finance/config';
import { WorkerService } from './worker.service';

export type Block = any;
export type TransactionResponse = ethers.TransactionResponse | any;
export type TransactionReceipt = ethers.TransactionReceipt | any;
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
export enum TransferAmountTransactionStatus {
  none,
  pending,
  confirmed,
  failed,
}
export interface TransferAmountTransaction {
  chainId: string;
  hash: string;
  blockNumber: number;
  sender: string;
  receiver: string;
  amount: string;
  value: string;
  token: string;
  symbol: string;
  fee: string;
  feeAmount: string;
  timestamp: number;
  status: TransferAmountTransactionStatus;
  nonce: number;
  calldata?: object;
  contract?: string;
  selector?: string;
  signature?: string;
  version?: string;
  feeToken: string;
  receipt?: any;
}

export interface Context {
   chainConfigService: ChainConfigService,
   transactionService: TransactionService,
   mdcService: MdcService,
   makerService: MakerService,
   workerService: WorkerService
}