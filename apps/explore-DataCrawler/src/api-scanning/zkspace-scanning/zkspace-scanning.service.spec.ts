import { Test, TestingModule } from '@nestjs/testing';
import { ZKSpaceApiScanningService } from './zkspace-scanning.service';

describe('ZkspaceScanningService', () => {
  let service: ZKSpaceApiScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ZKSpaceApiScanningService],
    }).compile();

    service = module.get<ZKSpaceApiScanningService>(ZKSpaceApiScanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
