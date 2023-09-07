import { Test, TestingModule } from '@nestjs/testing';
import { ApiScanningService } from './api-scanning.service';

describe('ApiScanningService', () => {
  let service: ApiScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiScanningService],
    }).compile();

    service = module.get<ApiScanningService>(ApiScanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
