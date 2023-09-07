/**
 * ex
 * {
    "chain0": "1",
    "chain0ResponseTime": 33,
    "chain0Status": 0,
    "chain0Token": "0xb88612bad3552c2a08bb5ce67f54d98b6489af40",
    "chain0TradeFee": 1,
    "chain0WithholdingFee": "762939453125",
    "chain0maxPrice": "3125",
    "chain0minPrice": "25",
    "chain1": "2",
    "chain1CompensationRatio": 30,
    "chain1ResponseTime": 28,
    "chain1Status": 1,
    "chain1Token": "0xe91e3694c4829ee3dc8df7014f2a640341133585",
    "chain1TradeFee": 2,
    "chain1WithholdingFee": "5",
    "chain1maxPrice": "931322574615478515625",
    "chain1minPrice": "59604644775390625"
}
 */
export interface IRule {
  id: string;
  chain0: string;
  chain0ResponseTime: number;
  chain0Status: number;
  chain0Token: string;
  chain0TradeFee: number;
  chain0WithholdingFee: string;
  chain0maxPrice: string;
  chain0minPrice: string;
  chain1: string;
  chain1CompensationRatio: number;
  chain1ResponseTime: number;
  chain1Status: number;
  chain1Token: string;
  chain1TradeFee: number;
  chain1WithholdingFee: string;
  chain1maxPrice: string;
  chain1minPrice: string;
}

export interface IOneWayRule {
  ruleId: string;
  fromNetworkId: string;
  toNetworkId: string;
  fromChainResponseTime: number;
  fromChainStatus: number;
  fromChainToken: string;
  fromChainTradeFee: number;
  fromChainWithholdingFee: string;
  fromChainMaxPrice: string;
  fromChainMinPrice: string;
}

export interface IChainIdSnapshot {
  latestUpdateTimestamp: string;
  chainIdList: string[];
}

export interface IRuleSnapshot {
  latestUpdateTimestamp: string;
  ebc: { id: string };
  rules: IRule[];
}

export interface IEbcSnapshot {
  latestUpdateTimestamp: string;
  ebcMapping: { ebcAddr: string; ebcIndex: string }[];
}

export interface IDealerSnapshot {
  latestUpdateTimestamp: string;
  dealerMapping: { dealerAddr: string; dealerIndex: string }[];
}

export interface IResponseMakers {
  latestUpdateTimestamp: string;
  responseMakerList: string[];
}

export interface IMdc {
  id: string;
  owner: string;
  responseMakers: IResponseMakers[];
  chainIdSnapshots: IChainIdSnapshot[];
  ebcSnapshots: IEbcSnapshot[];
  dealerSnapshots: IDealerSnapshot[];
  ruleSnapshots: IRuleSnapshot[];
}
