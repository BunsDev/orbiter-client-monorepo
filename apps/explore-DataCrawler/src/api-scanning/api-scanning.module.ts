import { Module } from '@nestjs/common';
import { ApiScanningSchedule } from './api-scanning-schedule.service';
import { ApiScanningFactory } from './api-scanning.factory';
import { TransactionModule } from '../transaction/transaction.module';
@Module({
  imports:[TransactionModule],
  providers: [ApiScanningFactory, ApiScanningSchedule],
  exports: [ApiScanningFactory],
})
export class ApiScanningModule {}
