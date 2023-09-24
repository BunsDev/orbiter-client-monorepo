import { EvmRpcScanningService } from './rpc-scanning.service';

describe('EvmRpcScanningService', () => {
  const service: EvmRpcScanningService = new EvmRpcScanningService(5);

  // beforeEach(async () => {
  //   const module: TestingModule = await Test.createTestingModule({
  //     providers: [EvmRpcScanningService],
  //   }).compile();
  //
  //   service = module.get<EvmRpcScanningService>(new EvmRpcScanningService(5));
  // });

  it('should be defined', async () => {
    const res = await service.provider.getBlock(9404888, true);
  }, 180000);
});
