import { Test, TestingModule } from '@nestjs/testing';
import { RpcCheckService } from './rpc-check.service';

describe('RpcCheckService', () => {
  let service: RpcCheckService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RpcCheckService],
    }).compile();

    service = module.get<RpcCheckService>(RpcCheckService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
