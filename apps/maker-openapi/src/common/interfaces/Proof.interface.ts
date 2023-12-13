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

export interface ProofSubmissionRequest {
    status: number;
    transaction: string;
    proof: string;
    message: string;
}

export interface UserAskProofRequest {
    challenger?: string;
    hash: string;
}

export interface MakerAskProofRequest {
    hash: string;
}

export interface CompleteProofSubmission {
    hash: string;
}


export interface TxData {
    hash?: string;
    mdcAddress?: string;
    makerAddress?: string;
    sourceChain?: string;
    targetChain?: string;
    ruleKey?: string;
    isSource?: number;
    challenger?: string;
    spvAddress?: string;
    rawDatas?: string;
    rlpRuleBytes?: string;

    targetNonce?: string;
    targetChainId?: string;
    targetFrom?: string;
    targetToken?: string;
    targetAmount?: string;
    responseMakersHash?: string;
    responseTime?: string;
}

export interface ProofData {
    proof?: string;
    hash?: string;
    mdcAddress?: string;
    makerAddress?: string;
    isSource?: number;
    sourceChain?: string;
    targetChain?: string;
    challenger?: string;
    spvAddress?: string;
    rawDatas?: string;
    rlpRuleBytes?: string;

    targetNonce?: string;
    targetChainId?: string;
    targetFrom?: string;
    targetToken?: string;
    targetAmount?: string;
    responseMakersHash?: string;
    responseTime?: string;

    status: number;
    message: string;
}
