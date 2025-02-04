export interface RoutersConfig {
	line:string;
    endpoint: string;
	endpointContract:string;
    srcChain: string;
    tgtChain: string;
    srcToken: string;
    tgtToken: string;
    maxAmt: string;
    minAmt: string;
    tradeFee: string;
	state: 'available' | 'disabled',
    withholdingFee: string;
    vc:string;
    compRatio?:number; // 1000000
    spentTime?:number;// second
}


export interface Feature {
	name: string;
}

export interface NativeCurrency {
	name: string;
	symbol: string;
	decimals: number;
}

export interface En {
	registry: string;
}

export interface Explorer {
	name: string;
	url: string;
	standard: string;
}
