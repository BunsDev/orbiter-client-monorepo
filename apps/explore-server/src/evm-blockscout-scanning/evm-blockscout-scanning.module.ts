import { Module } from '@nestjs/common';
import { EvmBlockscoutScanningService } from './evm-blockscout-scanning.service';

@Module({
  providers: [EvmBlockscoutScanningService],
})
export class EvmBlockscoutScanningModule {}
