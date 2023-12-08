import { Test, TestingModule } from '@nestjs/testing';
import { DealerController } from './dealer.controller';

describe('DealerController', () => {
  let controller: DealerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DealerController],
    }).compile();

    controller = module.get<DealerController>(DealerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
