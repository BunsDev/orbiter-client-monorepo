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
