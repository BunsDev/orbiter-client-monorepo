import { Test, TestingModule } from '@nestjs/testing';
import { MakerService } from './maker.service';

describe('MakerService', () => {
  let service: MakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MakerService],
    }).compile();

    service = module.get<MakerService>(MakerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
