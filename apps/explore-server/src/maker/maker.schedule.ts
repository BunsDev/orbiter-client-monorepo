import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MakerService } from './maker.service'
@Injectable()
export class MakerScheduuleService {

    constructor(private makerService: MakerService) {
        this.makerService.syncV2MakerOwnersToCache();
        this.makerService.syncV2MakerOwnerResponseToCache();
    }
    @Cron('* */1 * * * *')
    syncV2Owners() {
        this.makerService.syncV2MakerOwnersToCache();
    }
    @Cron('* */2 * * * *')
    syncV2MakerOwnerResponseToCache() {
        this.makerService.syncV2MakerOwnerResponseToCache();
    }
}