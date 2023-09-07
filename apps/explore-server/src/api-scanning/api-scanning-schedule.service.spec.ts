import { Test, TestingModule } from '@nestjs/testing';
import { ApiScanningScheduleService } from './api-scanning-schedule.service';

describe('ApiScanningScheduleService', () => {
  let service: ApiScanningScheduleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiScanningScheduleService],
    }).compile();

    service = module.get<ApiScanningScheduleService>(
      ApiScanningScheduleService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
