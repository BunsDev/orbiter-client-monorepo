import { Test, TestingModule } from '@nestjs/testing';
import { ArbitrationService } from './arbitration.service';

describe('ArbitrationService', () => {
  let service: ArbitrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArbitrationService],
    }).compile();

    service = module.get<ArbitrationService>(ArbitrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
