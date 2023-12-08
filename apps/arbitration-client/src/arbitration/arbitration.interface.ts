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
    spvAddress?: string;
    targetChainId?: number;
    targetTxHash?: string;
    sourceChainId?: number;
    sourceTxHash?: string;
    mdcAddress: string;
    status: number;
    targetNonce?: string; // TODO
    targetFrom?: string; // TODO
    targetToken?: string; // TODO
    targetAmount?: string; // TODO
    responseMakersHash?: string; // TODO
    responseTime?: string; // TODO
    rawDatas?:string; // TODO
    rlpRuleBytes?:string; // TODO
}

export interface MakerResponseArbitrationTransaction {
    proof: string;
    hash: string;
    isSource: number;
}
