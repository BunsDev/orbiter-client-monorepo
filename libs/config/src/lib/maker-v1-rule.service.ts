import { Inject, Injectable } from '@nestjs/common';
import { ConsulService } from 'libs/nestjs-consul/src/index'

@Injectable()
export class MakerV1RuleService {
    get configs() {
        const config = this.consul.configs['/rules/']
        return config && this.format(config);
    }
    constructor(
        private readonly consul: ConsulService<any>,
    ) {
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
