import { Test, TestingModule } from '@nestjs/testing';
import { EvmBlockscoutScanningService } from './evm-blockscout-scanning.service';

describe('EvmBlockscoutScanningService', () => {
  let service: EvmBlockscoutScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvmBlockscoutScanningService],
    }).compile();

    service = module.get<EvmBlockscoutScanningService>(
      EvmBlockscoutScanningService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
