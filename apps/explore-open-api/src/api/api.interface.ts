export enum ECode {
  Success = 0,

  Fail = 1,

  NotModified = 304, // There was no new data to return.

  BadRequest = 400,

  Unauthorized = 401, // There was a problem authenticating your request. This could be due to missing or incorrect authentication credentials. This may also be returned in other undefined circumstances.

  Forbidden = 403, // The request is understood, but it has been refused or access is not allowed. An accompanying error message will explain why.

  InternalError = 500,

  MethodNotFound = -32601,

  JsonrpcParseError = -32700
}

export interface ITradingPair {
  pairId: string;
  recipient: string;
  sender: string;
  gasFee: string;
  tradingFee: string;
  slippage: number;
  dealerId?: string;
  ebcId?: string;
  originWithholdingFee?: string;
  sendType: number;
  fromChain: {
    id: number;
    networkId: string;
    chainId: string;
    name: string;
    symbol: string;
    tokenAddress: string;
    decimals: number;
    maxPrice: number;
    minPrice: number;
  };
  toChain: {
    id: number;
    networkId: string;
    chainId: string;
    name: string;
    symbol: string;
    tokenAddress: string;
    decimals: number;
  };
}
