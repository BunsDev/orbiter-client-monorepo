import { Injectable } from '@nestjs/common';
import chains from '../../../assets/chains.json'
import { ChainConfigService } from '@orbiter-finance/config';
import { ChainConfig } from '../bridge.interface'
@Injectable()
export class ChainsService {
    constructor(private chainConsulService: ChainConfigService) {
    }
    async getChains(): Promise<ChainConfig[]> {
        const chainConfigs = await this.chainConsulService.getAllChains();
        const result: any[] = [];
        for (const config of chainConfigs) {
            result.push({
                chainId: String(config.chainId),
                networkId: String(config.networkId),
                internalId: config.internalId,
                name: config.name,
                contract: config.contract,
                nativeCurrency: config.nativeCurrency,
                tokens: config.tokens
            })
        }
        return result as any;
    }
}
