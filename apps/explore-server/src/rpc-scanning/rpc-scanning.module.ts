import { Module } from '@nestjs/common';
import { RpcScanningSchedule } from './rpc-scanning.schedule';
import { RpcScanningFactory } from './rpc-scanning.factory';
import {WorkerService} from './worker.service'
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [TransactionModule],
  providers: [RpcScanningFactory, RpcScanningSchedule, WorkerService],
  exports: [RpcScanningFactory],
})
export class RpcScanningModule {}
