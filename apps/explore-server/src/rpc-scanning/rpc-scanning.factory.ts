import { Injectable } from '@nestjs/common';

import * as data from '@orbiter-finance/config';

import { ChainConfigService } from '@orbiter-finance/config';
import { ArbitrumRpcScanningService } from './arbitrum/arbitrum.service';
import { OptimisticRpcScanningService } from './optimistic/optimistic.service';
import { BaseRpcScanningService } from './base/base.service';
import { EVMRpcScanningV6Service } from './evm/evm.v6.service';
import { RpcScanningService } from './rpc-scanning.service';
import { StarknetRpcScanningService } from './starknet/starknet.service';
import { TransactionService } from '../transaction/transaction.service';
import { EVMRpcScanningV5Service } from './evm/evm.v5.service';
import { MdcService } from '../thegraph/mdc/mdc.service';
import { ZKSyncEraRpcScanningService } from './zksyncEra/zksyncEra.service'
import { Context } from './rpc-scanning.interface'
import { MakerService } from '../maker/maker.service'
@Injectable()
export class RpcScanningFactory {
  constructor(
    private chainConfigService: ChainConfigService,
    private transactionService: TransactionService,
    protected mdcService: MdcService,
    protected makerService: MakerService,

  ) { }

  createService(chainId: string): RpcScanningService {
    const chainConfig = this.chainConfigService.getChainInfo(chainId);
    const key = chainConfig.service && chainConfig.service['rpc'];
    const ctx: Context = {
      chainConfigService: this.chainConfigService,
      transactionService: this.transactionService,
      mdcService: this.mdcService,
      makerService: this.makerService
    }
    switch (key) {
      case 'ZKSyncEraRpcScanningService':
        return new ZKSyncEraRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'EVMRpcScanningV5Service':
        return new EVMRpcScanningV5Service(
          chainId,
          ctx
        );
        break;
      case 'EVMRpcScanningService':
      case 'EVMRpcScanningV6Service':
        return new EVMRpcScanningV6Service(
          chainId,
          ctx
        );
        break;
      case 'ArbitrumRpcScanningService':
        return new ArbitrumRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'OptimisticRpcScanningService':
        return new OptimisticRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'BaseRpcScanningService':
        return new BaseRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'StarknetRpcScanningService':
        return new StarknetRpcScanningService(
          chainId,
          ctx
        );
        break;
      default:
        throw new Error(`${chainId} Not Config RPC Service Class`);
    }
  }
}
