import { Module } from '@nestjs/common';
import { RpcScanningSchedule } from './rpc-scanning.schedule';
import { RpcScanningFactory } from './rpc-scanning.factory';
import { MdcService } from '../thegraph/mdc/mdc.service';
import { TransactionModule } from '../transaction/transaction.module';
import {MakerModule} from '../maker/maker.module'

@Module({
  imports: [TransactionModule,MakerModule],
  providers: [RpcScanningFactory, RpcScanningSchedule, MdcService],
  exports: [RpcScanningFactory],
})
export class RpcScanningModule {}
