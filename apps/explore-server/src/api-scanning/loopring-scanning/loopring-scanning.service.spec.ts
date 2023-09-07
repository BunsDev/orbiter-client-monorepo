import { Test, TestingModule } from '@nestjs/testing';
import { LoopringApiScanningService } from './loopring-scanning.service';

describe('LoopringScanningService', () => {
  let service: LoopringApiScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoopringApiScanningService],
    }).compile();

    service = module.get<LoopringApiScanningService>(
      LoopringApiScanningService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
