import { Test, TestingModule } from '@nestjs/testing';
import { DealerService } from './dealer.service';

describe('DealerService', () => {
  let service: DealerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DealerService],
    }).compile();

    service = module.get<DealerService>(DealerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
