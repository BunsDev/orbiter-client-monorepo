import { Test, TestingModule } from '@nestjs/testing';
import { OptimisticRpcScanningService as OptimisticService } from './optimistic.service';

describe('OptimisticService', () => {
  let service: OptimisticService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptimisticService],
    }).compile();

    service = module.get<OptimisticService>(OptimisticService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
