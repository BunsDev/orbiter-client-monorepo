import { Module } from '@nestjs/common';
import { RpcScanningSchedule } from './rpc-scanning.schedule';
import { RpcScanningFactory } from './rpc-scanning.factory';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [TransactionModule],
  providers: [RpcScanningFactory, RpcScanningSchedule],
  exports: [RpcScanningFactory],
})
export class RpcScanningModule {}
