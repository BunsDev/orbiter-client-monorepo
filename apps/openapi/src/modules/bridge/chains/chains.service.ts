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
        for (const config of chainConfigs) {
            delete config.api;
            delete config.rpc;
            delete config.debug;
            delete config.service;
            delete config.contracts;
            delete config.tokens;
        }
        return chainConfigs as any;
    }
}
