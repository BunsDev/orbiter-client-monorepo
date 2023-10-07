import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MakerService } from './maker.service'
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { SubgraphClient } from '@orbiter-finance/subgraph-sdk'
import { ENVConfigService } from '@orbiter-finance/config';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
@Injectable()
export class MakerScheduuleService {
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;
    constructor(
        protected envConfigService: ENVConfigService,
        private readonly makerService: MakerService,
        @InjectRedis() private readonly redis: Redis) {
        this.syncV1Owners()
        this.syncV2ChainTokens()
        this.syncV2Owners()

    }
    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = await this.envConfigService.getAsync("SubgraphEndpoint");
        if (!SubgraphEndpoint) {
            throw new Error('SubgraphEndpoint not found');
        }
        return new SubgraphClient(SubgraphEndpoint);
    }
    @Interval(1000 * 30)
    async syncV2ChainTokens() {
        try {
            const subgraphClient = await this.getSubClient();
            const chains = await subgraphClient.factory.getChainTokens();
            const chainMap = {
            }
            for (const chain of chains) {
                chainMap[chain.id] = JSON.stringify(chain);
            }
            await this.redis.hmset('chains', chainMap)
        } catch (error) {
            this.logger.error('syncV2ChainTokens error:', error);
        }

    }

    @Interval(1000 * 10)
    async syncV2Owners() {
        try {
            const subgraphClient = await this.getSubClient()
            const owners = await subgraphClient.factory.getOwners() || [];
            const v2OwnersCount = await this.redis.scard("v2Owners");
            if (owners.length > 0 && v2OwnersCount != owners.length) {
                await this.redis.sadd("v2Owners", owners)
                this.logger.info(`syncV2Owners ${JSON.stringify(owners)}`)
            }
        } catch (error) {
            this.logger.error('syncV2Owners error:', error);
        }
    }
    @Interval(1000 * 60)
    async syncV1Owners() {
        try {
            const v1Makers = await this.makerService.getV1MakerOwners();
            const v1OwnersCount = await this.redis.scard("v1Owners");
            if (v1Makers.length > 0 && v1OwnersCount != v1Makers.length) {
                const _result = await this.redis.sadd("v1Owners", v1Makers)
            }
            const fakeMakerList = await this.makerService.getV1MakerOwnerResponse();
            const v1FakeMakerCount = await this.redis.scard("v1FakeMaker");
            if (fakeMakerList.length > 0 && v1FakeMakerCount != fakeMakerList.length) {
                const _result = await this.redis.sadd("v1FakeMaker", fakeMakerList)
            }
        } catch (error) {
            this.logger.error('syncV1Owners error:', error);
        }

    }
}