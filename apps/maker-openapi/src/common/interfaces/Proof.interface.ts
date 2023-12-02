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
}

export interface CompleteProofSubmission {
    hash: string;
}


export interface TxData {
    hash: string;
    sourceChain: string;
    targetChain: string;
    ruleKey: string;
    isSource: number
}
