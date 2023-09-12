import { Module } from '@nestjs/common';
import { ApiScanningSchedule } from './api-scanning-schedule.service';
import { ApiScanningFactory } from './api-scanning.factory';
import { TransactionModule } from '../transaction/transaction.module';
import { MdcService } from '../thegraph/mdc/mdc.service';
import {MakerModule} from '../maker/maker.module'
@Module({
  imports: [TransactionModule,MakerModule],
  providers: [ApiScanningFactory, ApiScanningSchedule, MdcService],
  exports: [ApiScanningFactory],
})
export class ApiScanningModule {}
