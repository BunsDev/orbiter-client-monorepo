import { Module } from '@nestjs/common';
import { ScanningController } from './scanning/scanning.controller';
import { RpcScanningModule } from '../rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from '../api-scanning/api-scanning.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [RpcScanningModule, ApiScanningModule, TransactionModule],
  controllers: [ScanningController],
  providers: [],
})
export class ApiModule {}
