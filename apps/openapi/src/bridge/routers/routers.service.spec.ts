import { Test, TestingModule } from '@nestjs/testing';
import { RoutersService } from './routers.service';

describe('RoutersService', () => {
  let service: RoutersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutersService],
    }).compile();

    service = module.get<RoutersService>(RoutersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
