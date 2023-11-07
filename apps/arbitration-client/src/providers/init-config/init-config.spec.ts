import { Test, TestingModule } from '@nestjs/testing';
import { InitConfig } from './init-config';

describe('InitConfig', () => {
  let provider: InitConfig;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InitConfig],
    }).compile();

    provider = module.get<InitConfig>(InitConfig);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
