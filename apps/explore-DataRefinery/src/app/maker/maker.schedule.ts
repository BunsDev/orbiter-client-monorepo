import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MakerService } from './maker.service'
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { SubgraphClient } from '@orbiter-finance/subgraph-sdk'
import { ENVConfigService } from '@orbiter-finance/config';
@Injectable()
export class MakerScheduuleService {
    constructor(
        protected envConfigService: ENVConfigService,
        private readonly makerService: MakerService,
        @InjectRedis() private readonly redis: Redis) {
        this.syncV1Owners()

        this.syncV2ChainTokens()
        this.syncV2Owners()

    }
    @Cron('* */1 * * * *')
    async syncV2ChainTokens() {
        const subgraphClient = new SubgraphClient(await this.envConfigService.getAsync("SubgrapheEndpoint"));
        const chains = await subgraphClient.factory.getChainTokens();
        const chainMap = {
        }
        for (const chain of chains) {
            chainMap[chain.id] = JSON.stringify(chain);
        }
        await this.redis.hmset('chains', chainMap)
    }

    @Cron('* */1 * * * *')
    async syncV2Owners() {
        const subgraphClient = new SubgraphClient(await this.envConfigService.getAsync("SubgrapheEndpoint"));
        const owners = await subgraphClient.factory.getOwners();
        const v2OwnersCount = await this.redis.scard("v2Owners");
        if (owners.length > 0 && v2OwnersCount != owners.length) {
            await this.redis.sadd("v2Owners", owners)
            Logger.log(`syncV2Owners ${JSON.stringify(owners)}`)
        }
    }
    @Cron('* */2 * * * *')
    async syncV1Owners() {
        const v1Makers = await this.makerService.getV1MakerOwners();
        const v1OwnersCount = await this.redis.scard("v1Owners");
        if (v1Makers.length > 0 && v1OwnersCount != v1Makers.length) {
            const result = await this.redis.sadd("v1Owners", v1Makers)
        }
        const fakeMakerList = await this.makerService.getV1MakerOwnerResponse();
        const v1FakeMakerCount = await this.redis.scard("v1FakeMaker");
        if (fakeMakerList.length > 0 && v1FakeMakerCount != fakeMakerList.length) {
            const result = await this.redis.sadd("v1FakeMaker", fakeMakerList)
        }
    }
}