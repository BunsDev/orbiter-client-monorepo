import { Test, TestingModule } from '@nestjs/testing';
import { ImmutableApiScanningService } from './immutable-scanning.service';

describe('ImmutableScanningService', () => {
  let service: ImmutableApiScanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImmutableApiScanningService],
    }).compile();

    service = module.get<ImmutableApiScanningService>(
      ImmutableApiScanningService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
