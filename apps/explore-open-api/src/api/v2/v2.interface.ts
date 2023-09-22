export interface IMakerConfig {
  [makerAddress: string]: {
    [chainIdPair: string]: {
      [symbolPair: string]: IMakerDataConfig;
    };
  };
}

export interface IMakerDataConfig {
  id:string;
  makerAddress: string;
  sender: string;
  gasFee: number;
  tradingFee: number;
  maxPrice: number;
  minPrice: number;
  slippage: number;
  startTime: number;
  endTime: number;
}
