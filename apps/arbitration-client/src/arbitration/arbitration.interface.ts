export interface ArbitrationTransaction {
    sourceMaker: string;
    sourceTxTime: number;
    sourceChainId: number;
    sourceTxBlockNum: number;
    sourceTxIndex: number;
    sourceTxHash: string;
    ruleKey: string;
    freezeToken: string;
    freezeAmount1: string;
    parentNodeNumOfTargetNode: number;
}

export interface ArbitrationResponseTransaction {
    chainId: string;
    hash: string;
}

export interface ArbitrationDB {
    challenger?: string;
    targetChainId?: number;
    targetTxHash?: string;
    sourceChainId?: number;
    sourceTxHash?: string;
    mdcAddress: string;
    status: number;
}

export interface MakerResponseArbitrationTransaction {
    proof: string;
    hash: string;
    isSource: number;
}
