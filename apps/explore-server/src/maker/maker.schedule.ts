import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MakerService } from './maker.service'
@Injectable()
export class MakerScheduuleService {

    constructor(private makerService: MakerService) {

    }
    @Cron('*/5 * * * * *')
    syncV2Owners() {
        this.makerService.syncV2MakerOwnersToCache();
        this.makerService.syncV2MakerOwnerResponseToCache();
    }
}