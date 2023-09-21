import { Module } from '@nestjs/common';
import { ApiScanningSchedule } from './api-scanning-schedule.service';
import { ApiScanningFactory } from './api-scanning.factory';
@Module({
  providers: [ApiScanningFactory, ApiScanningSchedule],
  exports: [ApiScanningFactory],
})
export class ApiScanningModule {}
