import { Test, TestingModule } from '@nestjs/testing';
import { ProceedsController } from './proceeds.controller';

describe('ProceedsController', () => {
  let controller: ProceedsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProceedsController],
    }).compile();

    controller = module.get<ProceedsController>(ProceedsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
