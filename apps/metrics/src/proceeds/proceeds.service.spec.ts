import { Test, TestingModule } from '@nestjs/testing';
import { ProceedsService } from './proceeds.service';

describe('ProceedsService', () => {
  let service: ProceedsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProceedsService],
    }).compile();

    service = module.get<ProceedsService>(ProceedsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
