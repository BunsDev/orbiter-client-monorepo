import { Module } from '@nestjs/common';
import { MdcService } from './mdc/mdc.service';
import { ThegraphManagerService } from './manager/manager.service';
@Module({
  providers: [MdcService, ThegraphManagerService],
})
export class ThegraphModule {}
