import { Context } from './subgraph-sdk'
export class MakerService {
  constructor(private readonly ctx: Context) {
  }
  async getCrossChainMakerSecurityCodeInfo(owner: string, dealerIndex: number, ebcIndex: number, chainIndex: number, txTimestamp: number) {
    const queryStr = `
        query MyQuery {
          chainIdMappingSnapshots(
            where: {chainIdIndex: "${chainIndex}", owner: "${owner}", enableTimestamp_lt: "${txTimestamp}"}
            orderBy: enableTimestamp
            orderDirection: desc
            first: 1
          ) {
            id
            chainId
          }
          ebcMappingSnapshots(
            where: {ebcIndex: "${ebcIndex}", owner: "${owner}", enableTimestamp_lt: "${txTimestamp}"}
            orderBy: enableTimestamp
            orderDirection: desc
            first: 1
          ) {
            id
            ebcAddr
          }
          dealerMappingSnapshots(
            where: {dealerIndex: "${dealerIndex}", owner: "${owner}", enableTimestamp_lt: "${txTimestamp}"}
            orderBy: enableTimestamp
            orderDirection: desc
            first: 1
          ) {
            id
            dealerAddr
          }
        }
          `
    const result = await this.ctx.query(queryStr, {
    });
    return result;

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
      chain1Token = sourceToken;
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
  async getMDCAddress(owner: string) {
    const queryStr = `
    {
      mdcs(where: {owner: "${owner}"}) {
        id
        owner
      }
    }
          `
    const result = await this.ctx.query(queryStr);
    return result?.mdcs?.[0]?.id;
  }
  async getChallengeUserRatio() {
    const queryStr = `
    {
      challengeUserRatioUpdateds(
        first: 1
        orderBy: blockNumber
        orderDirection: desc
      ) {
        challengeUserRatio
      }
    }`
    const result = await this.ctx.query(queryStr);
    const challengeUserRatioUpdateds = result['challengeUserRatioUpdateds'][0];
    if (challengeUserRatioUpdateds.length>0){
      return challengeUserRatioUpdateds[0].challengeUserRatio;
    }
    return null;
  }
    async getColumnArray(txTimestamp: string | number, mdcAddress: string, maker: string) {
        const queryStr = `
   {
        columnArraySnapshots(
            where: {
                enableTimestamp_lt: "${txTimestamp}",
                mdc_: {
                    id: "${mdcAddress}"
                    owner: "${maker}"
                }
            }
            first: 1
        ) {
            dealers
            ebcs
            chainIds
        }
    }
          `;
        const result = await this.ctx.query(queryStr);
        return result.columnArraySnapshots?.[0];
    }
    async getRules(mdcAddr: string, ebcAddr: string, maker: string) {
        const queryStr = `
   {
        latestRuleSnapshots(
          where: {
            owner: "${maker}", 
            mdcAddr: "${mdcAddr}", 
            ebcAddr: "${ebcAddr}"
            }
        orderBy: ruleRelSnapshot__version 
        orderDirection : asc
        ) {
          ruleRelSnapshot {
            root
            version
          }
          chain0
          chain1
          chain0Status
          chain1Status
          chain0Token
          chain1Token
          chain0minPrice
          chain1minPrice
          chain0maxPrice
          chain1maxPrice
          chain0WithholdingFee
          chain1WithholdingFee
          chain0TradeFee
          chain1TradeFee
          chain0ResponseTime
          chain1ResponseTime
          chain0CompensationRatio
          chain1CompensationRatio
          enableTimestamp
          latestUpdateBlockNumber
        }
      }
          `;
        const result = await this.ctx.query(queryStr);
        console.log("result", result?.latestRuleSnapshots?.[0]);
        return result?.latestRuleSnapshots?.[0];
    }
}
