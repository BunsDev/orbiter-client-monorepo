export interface RoutersConfig {
    endpoint: string;
    srcChain: string;
    tgtChain: string;
    srcToken: string;
    tgtToken: string;
    maxAmt: string;
    minAmt: string;
    tradeFee: string;
    withholdingFee: string;
    vc:string;
    compRatio?:number; // 1000000
    spentTime?:number;// second
}