import { Context } from './subgraph-sdk'
export class Factory {
    constructor(private readonly ctx: Context) {
    }
    async GetChainIdMapping() {
        const queryStr = `
        query GetChainIdMapping($owner: String!, $timestamp: Int!, $chainIndex: Int!) {
            chainIdMappings(
              first: 1
              orderBy: latestUpdateBlockNumber
              orderDirection: desc
              where: {enableTimestamp_lt:$timestamp, owner: $owner, chainIdIndex: $chainIndex}
            ) {
              id
              index
              chainId
              updatedBlock
            }
          }
          `
        const result = await this.ctx.query(queryStr, {
            owner: '0x',
            timestamp:Date.now(),
            chainIndex: 0
        });
        console.log(result, '===result')
        return result;
    }
    async getOwners() {
    const queryStr = `
        query Owners {
            factoryManagers {
              owners
            }
          }
          `
    const result = await this.ctx.query(queryStr);
    return result['factoryManagers'][0]['owners'];

}
}