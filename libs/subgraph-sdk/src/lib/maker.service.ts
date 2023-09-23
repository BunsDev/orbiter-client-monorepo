import { Context } from './subgraph-sdk'
export class MakerService {
    constructor(private readonly ctx: Context) {
    }
    async getCrossChainMakerSecurityCodeInfo(owner: string, dealerIndex: number, ebcIndex: number, chainIndex: number, txTimestamp: number) {
        const queryStr = `
        query MyQuery {
        mdcs(where: {owner: "${owner}"}) {
          id
          owner
          chainIdSnapshot (orderBy: latestUpdateTimestamp, orderDirection: desc, first: 1)  {
            chainIdMappingSnapshot(
                where: {chainIdIndex: "${chainIndex}", enableTimestamp_lt: "${txTimestamp}"}, 
                orderBy: latestUpdateTimestamp
                orderDirection: desc
                first: 1) {
              id
              chainId
            }
          }
          ebcSnapshot(orderBy: latestUpdateTimestamp, orderDirection: desc, first: 1) {
            ebcMappingSnapshot(
                where: {ebcIndex: "${ebcIndex}", enableTimestamp_lt: "${txTimestamp}"}, 
                orderBy: latestUpdateTimestamp
                orderDirection: desc
                first: 1) {
              id
              ebcAddr
            }
          }
          dealerSnapshot(orderBy: latestUpdateTimestamp, orderDirection: desc, first: 1) {
            dealerMappingSnapshot(
              where: {dealerIndex: "${dealerIndex}", enableTimestamp_lt: "${txTimestamp}"}
              orderBy: latestUpdateTimestamp
              orderDirection: desc
              first: 1) {
              id
              dealerAddr
            }
          }
        }
      }
          `
        const result = await this.ctx.query(queryStr, {
        });
        return result['mdcs'][0];

    }
    async getCrossChainMakerSecurityCodeInfoRule(owner: string, ebcAddr: string, sourceChain: number, targetChain: number, sourceToken: string, targetToken: string, txTime: number) {
        let chain0 = null;
        let chain1 = null;
        let chain0Token = null;
        let chain1Token = null;
        if (sourceChain > targetChain) {
            chain0 = targetChain;
            chain1 = sourceChain;
            chain0Token = targetToken;
            chain1Token = sourceChain;
        } else {
            chain0 = sourceChain;
            chain1 = targetChain;
            chain0Token = sourceToken;
            chain1Token = targetToken;
        }

        const queryStr = `
        query rule {
            mdcs(where: {owner: "${owner}"}) {
              id
              owner
              ruleLatest(where: {ebcAddr: "${ebcAddr}", chain0: "${chain0}", chain1: "${chain1}", chain0Token: "${chain0Token}", chain1Token: "${chain1Token}"}) {
                ruleUpdateRel {
                  ruleUpdateVersion(
                    orderBy: updateVersion
                    orderDirection: desc
                    where: {enableTimestamp_lt: "${txTime}", ruleValidation: true}
                    first: 1
                  ) {
                    id
                    chain0
                    chain0CompensationRatio
                    chain0ResponseTime
                    chain0Status
                    chain0Token
                    chain0TradeFee
                    chain0WithholdingFee
                    chain0maxPrice
                    chain0minPrice
                    chain1
                    chain1CompensationRatio
                    chain1ResponseTime
                    chain1Status
                    chain1Token
                    chain1TradeFee
                    chain1WithholdingFee
                    chain1maxPrice
                    chain1minPrice
                    ebcAddr
                    enableTimestamp
                    latestUpdateBlockNumber
                    latestUpdateHash
                    latestUpdateTimestamp
                    latestUpdateVersion
                  }
                }
              }
            }
          }
          `
        const result = await this.ctx.query(queryStr, {
        });
        if (result['mdcs'][0] && result['mdcs'][0]['ruleLatest'] && result['mdcs'][0]['ruleLatest'].length > 0) {
            const ruleUpdateRel = result['mdcs'][0]['ruleLatest'][0]['ruleUpdateRel'];
            if (ruleUpdateRel && ruleUpdateRel.length > 0 && ruleUpdateRel[0]['ruleUpdateVersion']) {
                return ruleUpdateRel[0]['ruleUpdateVersion'][0]
            }
        }
        return null;
    }
}