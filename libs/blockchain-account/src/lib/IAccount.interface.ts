import {
  type TransactionRequest as ETransactionRequest,
  type TransactionResponse as ETransactionResponse,
} from "ethers6";
export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

export class NetworkError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}
export class TransactionFailedError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionFailedError";
  }
}

export class TransactionSendConfirmFail extends Error {
  constructor(message: string = 'Transaction confirmation failed to send') {
      super(message);
      this.name = 'TransactionSendConfirmFail';
  }
}
export class NonceISTooDifferent extends Error {
  constructor(message: string = 'The nonce is too different from that on the chain') {
      super(message);
      this.name = 'NonceISTooDifferent';
  }
}

export class TransactionSendAfterError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionSendAfterError";
  }
}

export class TransactionSendIgError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionIgError";
  }
}
export type TransactionResponse = ETransactionResponse

export interface TransactionRequest extends ETransactionRequest {
  serialId?: string | string[];
}
export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest> {
  tokenId: number;
  feeTokenId: number;
  fee: bigint;
}
export interface TransferResponse {
  hash: string;
  to: string | undefined;
  from: string;
  nonce: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  fee?: bigint;
  feeSymbol?: string;
  symbol?: string;
  token?: string;
  data?: string;
  value: bigint;
  _response?: any;
}
export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest> {
  tokenId: number;
  feeTokenId: number;
  fee: bigint;
}
export interface LoopringSendTokenRequest extends TransactionRequest {
  maxFee?: number;
  feeTokenId?: number;
  memo?: string; // max 128
}
