import { IChainConfig } from '@orbiter-finance/config';
import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';
@Injectable()
export class ChainsService {
    constructor(private chainConsulService: ChainConfigService) {
    }
    
    async getChains(): Promise<IChainConfig[]> {
        const chainConfigs = await this.chainConsulService.getAllChains();
        const result: any[] = [];
        for (const config of chainConfigs) {
            let contracts = [];
            if (config.contracts) {
                contracts = config.contracts.map(c=> {
                    return {
                        name: c.name,
                        address: c.address
                    }
                })
            }
            result.push({
                chainId: String(config.chainId),
                networkId: String(config.networkId),
                internalId: config.internalId,
                name: config.name,
                contract: config.contract,
                nativeCurrency: config.nativeCurrency,
                tokens: [config.nativeCurrency, ...(config?.tokens || [])],
                contracts
            })
        }
        return result as any;
    }
}
