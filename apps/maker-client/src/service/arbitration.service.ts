import { AccountFactoryService } from '../factory';

import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ArbitrationModuleService, ArbitrationTransaction } from "@orbiter-finance/arbitration-module";
import { EVMAccount } from '@orbiter-finance/blockchain-account';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
@Injectable()
export class ArbitrationService {
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;
  
    constructor(private readonly chainConfigService: ChainConfigService,
        private readonly envConfigService: ENVConfigService,
        private readonly arbitrationModuleService: ArbitrationModuleService) {
    }
    @OnEvent('arbitration.create')
    async handleArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        const arbitrationPrivateKey = this.envConfigService.get("ArbitrationPrivateKey");
        if (!arbitrationPrivateKey) {
            this.logger.error('arbitrationPrivateKey not config');
            return;
        }
        const chainId = process.env['NODE_ENV'] === 'production' ? '1' : '5';
        const chainConfig = await this.chainConfigService.getChainInfo(chainId);
        if (!chainConfig) {
            this.logger.error(`${chainId} chainConfig not config`);
            return;
        }
        try {
            const account = new EVMAccount(chainId, {
                chainConfigService: this.chainConfigService,
                envConfigService: this.envConfigService
            })
            await account.connect(arbitrationPrivateKey)
            this.logger.info(`initiateArbitration wait initiateArbitration ${payload.fromHash}`);
            const result = await this.arbitrationModuleService.initiateArbitration(account, payload);
            this.logger.info(`initiateArbitration success ${result.hash}`);
            await result.wait()
            this.logger.info(`initiateArbitration wait success ${result.hash}`);
        } catch (error) {
            this.logger.error('Arbitration encountered an exception', error);
        }

    }
}