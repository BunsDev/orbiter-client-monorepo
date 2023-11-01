export interface V3TokenInterface {
	id: string;
    chainId: string;
	tokenAddress: string;
	decimals: number;
	name: string;
	symbol: string;
	mainnetToken: string;
}

export interface V3ChainInterface {
	id: string;
	nativeToken: string;
	tokens: V3TokenInterface[];
	batchLimit: string;

	latestUpdateHash: string;
	latestUpdateTimestamp: string;
	latestUpdateBlockNumber: string;
}
export interface V3RuleInterface {
	id: string;
	chain0: string;
	chain0CompensationRatio: number;
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
	ebcAddr: string;
	enableTimestamp: string;
	latestUpdateBlockNumber: string;
	latestUpdateHash: string;
	latestUpdateTimestamp: string;
	latestUpdateVersion: number;
}