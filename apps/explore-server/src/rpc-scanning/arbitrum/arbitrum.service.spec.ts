import { Test, TestingModule } from '@nestjs/testing';
import { ArbitrumRpcScanningService as ArbitrumService } from './arbitrum.service';

describe('ArbitrumService', () => {
  let service: ArbitrumService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArbitrumService],
    }).compile();

    service = module.get<ArbitrumService>(ArbitrumService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
