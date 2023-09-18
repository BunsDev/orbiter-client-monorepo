import { Module } from '@nestjs/common';
import { ScanningController } from './scanning/scanning.controller';
import { RpcScanningModule } from '../rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from '../api-scanning/api-scanning.module';
import { TransactionModule } from '../transaction/transaction.module';
import {MakerService} from '../maker/maker.service'
@Module({
  imports: [TransactionModule, RpcScanningModule, ApiScanningModule],
  controllers: [ScanningController],
  providers: [MakerService],
})
export class ApiModule {}
