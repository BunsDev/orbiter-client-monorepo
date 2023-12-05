import { Injectable } from '@nestjs/common';
import chains from '../../assets/chains.json'
import { ChainConfigService } from '@orbiter-finance/config';

@Injectable()
export class ChainsService {
    constructor(private chainConsulService: ChainConfigService) {
    }
    async getChains() {
        const chainConfigs = await this.chainConsulService.getAllChains();
        const result = [];
        const includeChains = chainConfigs.map(row => String(row.chainId));
        for (const chainId of includeChains) {
            const config = chainConfigs.find(row => String(row.chainId) == chainId)
            const chain = chains.find(c => String(c.chainId) == String(chainId));
            if (chain) {
                chain['internalId'] = config['internalId'];
                result.push(chain);
            } else {
                if (config) {
                    delete config.api;
                    delete config.rpc;
                    delete config.service;
                    delete config.contract;
                    delete config.tokens;
                    result.push(config);
                }
            }
        }
        return result;
    }
}
