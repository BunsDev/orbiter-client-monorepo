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
    minChallengeDepositAmount: string;
}

export interface ProofSubmissionRequest {
    status: number;
    transaction: string;
    proof: string;
    message: string;
}

export interface UserAskProofRequest {
    challenger: string;
    hash: string;
}

export interface MakerAskProofRequest {
    hash: string;
}

export interface CompleteProofSubmission {
    hash: string;
}
