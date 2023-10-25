export interface ArbitrationTransaction {
	fromHash: string;
	toHash?: any;
	fromChainId: string;
	toChainId: string;
	fromValue: string;
	toValue: string;
	fromAmount: string;
	toAmount: string;
	fromSymbol: string;
	status: number;
	fromTimestamp: number;
	toTimestamp?: any;
	sourceAddress: string;
	targetAddress: string;
	sourceMaker: string;
	targetMaker: string;
	sourceToken: string;
	targetToken: string;
	sourceDecimal: number;
	targetDecimal: number;
}