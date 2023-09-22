import { Module } from '@nestjs/common';
import { ScanningController } from './scanning/scanning.controller';
import { RpcScanningModule } from '../rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from '../api-scanning/api-scanning.module';
@Module({
  imports: [RpcScanningModule, ApiScanningModule],
  controllers: [ScanningController],
  providers: [],
})
export class ApiModule {}
