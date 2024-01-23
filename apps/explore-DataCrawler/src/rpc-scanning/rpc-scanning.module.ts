import { Module, forwardRef, Inject } from '@nestjs/common';
import { RpcScanningSchedule } from './rpc-scanning.schedule';
import { RpcScanningFactory } from './rpc-scanning.factory';
import { TransactionModule } from '../transaction/transaction.module';
import {ContractParserService} from '../rpc-scanning/contract-parser/ContractParser.service'
@Module({
  imports: [TransactionModule],
  providers: [RpcScanningFactory, RpcScanningSchedule, ContractParserService],
  exports: [RpcScanningFactory],
})
export class RpcScanningModule {}
