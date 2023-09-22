import { Context } from './subgraph-sdk'
export class Factory {
  constructor(private readonly ctx: Context) {
  }
  async getChainTokens() {
    const queryStr = `
    query chainTokens {
      chainRels {
        id
        nativeToken
        tokens {
          id
          tokenAddress
          chainId
          decimals
          name
          symbol
          mainnetToken
        }
        batchLimit
        latestUpdateHash
        latestUpdateTimestamp
        latestUpdateBlockNumber
      }
    }
          `
    const result = await this.ctx.query(queryStr);
    return result['chainRels'];
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