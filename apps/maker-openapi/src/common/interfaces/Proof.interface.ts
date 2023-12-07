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

export interface NeedProofSubmissionRequest {
    isSource: number;
    hash: string;
    chainId: number;
    mdcAddress: string;
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
    isSource?: number
}

export interface ProofData {
    proof?: string;
    hash?: string;
    mdcAddress?: string;
    makerAddress?: string;
    isSource?: number;
    sourceChain?: string;
    targetChain?: string;
}
