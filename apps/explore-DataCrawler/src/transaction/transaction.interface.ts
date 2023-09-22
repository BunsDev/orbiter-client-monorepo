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
  