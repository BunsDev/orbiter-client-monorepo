export interface ChainRel {
    id: string;
    nativeToken: string;
    minVerifyChallengeSourceTxSecond: string;
    minVerifyChallengeDestTxSecond: string;
    maxVerifyChallengeSourceTxSecond: string;
    maxVerifyChallengeDestTxSecond: string;
    batchLimit: string;
    enableTimestamp: string;
    latestUpdateHash: string;
    latestUpdateBlockNumber: string;
    latestUpdateTimestamp: string;
    spvs: string[];
}