import { Test, TestingModule } from '@nestjs/testing';
import { ZKLiteApiScanningService } from './zklite-scanning.service';

describe('ZkliteScanningService', () => {
  let service: ZKLiteApiScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ZKLiteApiScanningService],
    }).compile();

    service = module.get<ZKLiteApiScanningService>(ZKLiteApiScanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
