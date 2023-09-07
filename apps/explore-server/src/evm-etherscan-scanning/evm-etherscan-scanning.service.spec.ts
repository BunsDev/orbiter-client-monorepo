import { Test, TestingModule } from '@nestjs/testing';
import { EvmEtherscanScanningService } from './evm-etherscan-scanning.service';

describe('EvmEtherscanScanningService', () => {
  let service: EvmEtherscanScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvmEtherscanScanningService],
    }).compile();

    service = module.get<EvmEtherscanScanningService>(
      EvmEtherscanScanningService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
