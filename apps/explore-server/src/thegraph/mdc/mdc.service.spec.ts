import { Test, TestingModule } from '@nestjs/testing';
import { MdcService } from './mdc.service';

describe('MdcService', () => {
  let service: MdcService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MdcService],
    }).compile();

    service = module.get<MdcService>(MdcService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
