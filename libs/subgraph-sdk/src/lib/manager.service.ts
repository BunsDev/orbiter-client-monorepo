import { Context } from './subgraph-sdk'
import { ChainRel } from './subgraph.interface';

export class ManagerService {
    constructor(private readonly ctx: Context) {
    }
    async getChainRels(): Promise<Array<ChainRel>> {
        const queryStr = `
        query  {
            chainRels {
            id
            nativeToken
            minVerifyChallengeSourceTxSecond
            minVerifyChallengeDestTxSecond
            maxVerifyChallengeSourceTxSecond
            maxVerifyChallengeDestTxSecond
            batchLimit
            enableTimestamp
            latestUpdateHash
            latestUpdateBlockNumber
            latestUpdateTimestamp
            spvs
            }
      }
          `
        const result = await this.ctx.query(queryStr) || {};
        return result['chainRels'] || [];
    }
}