import { Module } from '@nestjs/common';
import { EvmEtherscanScanningService } from './evm-etherscan-scanning.service';

@Module({
  providers: [EvmEtherscanScanningService],
})
export class EvmEtherscanScanningModule {}
