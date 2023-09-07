import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';
import { ApiScanningService } from './api-scanning.service';
import { TransactionService } from '../transaction/transaction.service';
import { ZKLiteApiScanningService } from './zklite-scanning/zklite-scanning.service';
import { ImmutableApiScanningService } from './immutable-scanning/immutable-scanning.service';
import { LoopringApiScanningService } from './loopring-scanning/loopring-scanning.service';
import { ZKSpaceApiScanningService } from './zkspace-scanning/zkspace-scanning.service';
import { MdcService } from '../thegraph/mdc/mdc.service';
@Injectable()
export class ApiScanningFactory {
  constructor(
    private chainConfigService: ChainConfigService,
    protected transactionService: TransactionService,
    protected mdcService: MdcService,
  ) {}

  createService(chainId: string): ApiScanningService {
    const chainConfig = this.chainConfigService.getChainInfo(chainId);
    const key = chainConfig.service && chainConfig.service['api'];
    switch (key) {
      case 'ZKSpaceApiScanningService':
        return new ZKSpaceApiScanningService(
          chainId,
          this.chainConfigService,
          this.transactionService,
          this.mdcService,
        );
        break;
      case 'LoopringApiScanningService':
        return new LoopringApiScanningService(
          chainId,
          this.chainConfigService,
          this.transactionService,
          this.mdcService,
        );
        break;
      case 'ZKLiteApiScanningService':
        return new ZKLiteApiScanningService(
          chainId,
          this.chainConfigService,
          this.transactionService,
          this.mdcService,
        );
        break;
      case 'ImmutableApiScanningService':
        return new ImmutableApiScanningService(
          chainId,
          this.chainConfigService,
          this.transactionService,
          this.mdcService,
        );
        break;
      case 'ApiScanningService':
        return new ApiScanningService(
          chainId,
          this.chainConfigService,
          this.transactionService,
          this.mdcService,
        );
        break;
      default:
        throw new Error(`${chainId} Not Config Api Service Class`);
    }
  }
}
