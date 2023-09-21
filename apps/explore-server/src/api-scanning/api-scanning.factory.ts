import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';
import { ApiScanningService } from './api-scanning.service';
import { ZKLiteApiScanningService } from './zklite-scanning/zklite-scanning.service';
import { ImmutableApiScanningService } from './immutable-scanning/immutable-scanning.service';
import { LoopringApiScanningService } from './loopring-scanning/loopring-scanning.service';
import { ZKSpaceApiScanningService } from './zkspace-scanning/zkspace-scanning.service';
import {Context} from './api-scanning.interface'
@Injectable()
export class ApiScanningFactory {
  constructor(
    private chainConfigService: ChainConfigService,
  ) {}

  createService(chainId: string): ApiScanningService {
    const chainConfig = this.chainConfigService.getChainInfo(chainId);
    const key = chainConfig.service && chainConfig.service['api'];
    const ctx:Context = {
      chainConfigService: this.chainConfigService,
    }
    switch (key) {
      case 'ZKSpaceApiScanningService':
        return new ZKSpaceApiScanningService(
          chainId,
        ctx
        );
        break;
      case 'LoopringApiScanningService':
        return new LoopringApiScanningService(
          chainId,
       ctx)
        break;
      case 'ZKLiteApiScanningService':
        return new ZKLiteApiScanningService(
          chainId,
       ctx
        );
        break;
      case 'ImmutableApiScanningService':
        return new ImmutableApiScanningService(
          chainId,ctx
        );
        break;
      case 'ApiScanningService':
        return new ApiScanningService(
          chainId,ctx
        );
        break;
      default:
        throw new Error(`${chainId} Not Config Api Service Class`);
    }
  }
}
