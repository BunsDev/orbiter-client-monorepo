import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsulService } from 'libs/nestjs-consul/src/index'

@Injectable()
export class MakerV1RuleService {
    constructor(
        private readonly consul: ConsulService<any>
    ) {
    }
    get configs() {
        for (const key in this.consul.configs) {
            if (key.includes('rules')) {
                const config = this.consul.configs[key]
                return config && this.format(config);
            }
        }
    }

    async init() {
        
    }
    format(configs: any[]) {
        if (configs) {
            const makerRules = [];
            for (const file in configs) {
                const fileConfig = configs[file];
                for (const chainId in fileConfig) {
                    const chains = chainId.split('-');
                    for (const symbolId in fileConfig[chainId]) {
                        const ruleConfig = fileConfig[chainId][symbolId];
                        const symbols = symbolId.split('-');
                        makerRules.push({
                            ...ruleConfig,
                            chain: chainId,
                            token: symbolId,
                            sourceChainId: chains[0],
                            targetChainId: chains[1],
                            sourceSymbol: symbols[0],
                            targetSymbol: symbols[1],
                        });
                    }
                }
            }
            return makerRules;
        }
        return []
    }
}
