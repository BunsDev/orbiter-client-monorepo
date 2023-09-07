import { Test, TestingModule } from '@nestjs/testing';
import { ScanningController } from './scanning.controller';

describe('ScanningController', () => {
  let controller: ScanningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanningController],
    }).compile();

    controller = module.get<ScanningController>(ScanningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
