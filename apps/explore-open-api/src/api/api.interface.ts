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
  id: string;
  recipient: string;
  sender: string;
  tradingFee: number;
  gasFee: number;
  fromChain: {
    id: number;
    networkId: number;
    name: string;
    tokenAddress: string;
    contractAddress?: string;
    symbol: string;
    decimals: number;
    minPrice: number;
    maxPrice: number;
    isMainCoin: number;
  };
  toChain: {
    id: number;
    networkId?: number;
    name: string;
    tokenAddress: string;
    symbol: string;
    decimals: number;
  };
}
