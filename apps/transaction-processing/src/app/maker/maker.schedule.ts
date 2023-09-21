import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MakerService } from './maker.service'
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

@Injectable()
export class MakerScheduuleService {

    constructor(private readonly makerService: MakerService,
        @InjectRedis() private readonly redis: Redis) {
        this.syncV2Owners()
        this.syncV2MakerOwnerResponseToCache()
        this.syncV1Owners()
        this.syncV1MakerOwnerResponseToCache()
    }
    @Cron('* */1 * * * *')
    async syncV2Owners() {
        await this.makerService.syncV2MakerOwnersToCache();
        const afterList = await this.makerService.getV2MakerOwnersFromCache();
        const v2OwnersCount = await this.redis.scard("v2Owners");
        if (afterList.length > 0 && v2OwnersCount != afterList.length) {
            const result = await this.redis.sadd("v2Owners", afterList)
        }
    }
    @Cron('* */2 * * * *')
    async syncV2MakerOwnerResponseToCache() {
        this.makerService.syncV2MakerOwnerResponseToCache();
        const afterList = await this.makerService.getV2MakerOwnerResponseFromCache();
        const v2FakeMakerCount = await this.redis.scard("v2FakeMaker");
        if (afterList.length > 0 && v2FakeMakerCount != afterList.length) {
            const result = await this.redis.sadd("v2FakeMaker", afterList)
        }
    }
    @Cron('* */1 * * * *')
    async syncV1Owners() {
        const afterList = await this.makerService.getV1MakerOwners();
        const v1OwnersCount = await this.redis.scard("v1Owners");
        if (afterList.length > 0 && v1OwnersCount != afterList.length) {
            const result = await this.redis.sadd("v1Owners", afterList)
        }
    }
    @Cron('* */1 * * * *')
    async syncV1MakerOwnerResponseToCache() {
        const afterList = await this.makerService.getV1MakerOwnerResponse();
        const v1FakeMakerCount = await this.redis.scard("v1FakeMaker");
        if (afterList.length > 0 && v1FakeMakerCount != afterList.length) {
            const result = await this.redis.sadd("v1FakeMaker", afterList)
        }
    }
}