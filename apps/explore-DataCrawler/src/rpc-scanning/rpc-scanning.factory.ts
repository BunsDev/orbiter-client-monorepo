import { Injectable } from '@nestjs/common';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import { ArbitrumRpcScanningService } from './arbitrum/arbitrum.service';
import { OptimisticRpcScanningService } from './optimistic/optimistic.service';
import { BaseRpcScanningService } from './base/base.service';
import { EVMRpcScanningV6Service } from './evm/evm.v6.service';
import { RpcScanningService } from './rpc-scanning.service';
import { StarknetRpcScanningService } from './starknet/starknet.service';
import { EVMRpcScanningV5Service } from './evm/evm.v5.service';
import { ZKSyncEraRpcScanningService } from './zksyncEra/zksyncEra.service'
import { Context } from './rpc-scanning.interface'
import { TransactionService } from '../transaction/transaction.service';
import { MantleRpcScanningService } from './mantle/mantle.service'
import { ScrollRpcScanningService } from './scroll/scroll.service'
import { MantaRpcScanningService } from './manta/manta.service'
import { OPBNBScanningService } from './opbnb/opbnb.service'
import {L1FeeRpcScanningService} from './l1FeeService/l1Fee.service'
import { ContractParserService } from './contract-parser/ContractParser.service';
@Injectable()
export class RpcScanningFactory {
  public services: { [key: string]: RpcScanningService } = {}
  constructor(
    private chainConfigService: ChainConfigService,
    private transactionService: TransactionService,
    private envConfigService: ENVConfigService,
    private contractParser:ContractParserService
  ) { }

  createService(chainId: string): RpcScanningService {
    const chainConfig = this.chainConfigService.getChainInfo(chainId);
    if (!chainConfig) {
      throw new Error(`${chainId} chainConfig not found`);
    }
    const key = chainConfig.service && chainConfig.service['rpc'];
    if (this.services[chainId]) {
      return this.services[chainId];
    }
    const ctx: Context = {
      chainConfigService: this.chainConfigService,
      transactionService: this.transactionService,
      envConfigService: this.envConfigService,
      contractParser: this.contractParser
    }
    let service;
    switch (key) {
      case 'ZKSyncEraRpcScanningService':
        service = new ZKSyncEraRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'ScrollRpcScanningService':
        service = new ScrollRpcScanningService(
          chainId,
          ctx
        );
        break;
        case 'L1FeeRpcScanningService':
          service = new L1FeeRpcScanningService(
            chainId,
            ctx
          );
          break;
      case 'MantaRpcScanningService':
        service = new MantaRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'OPBNBScanningService':
        service = new OPBNBScanningService(
          chainId,
          ctx
        );
        break;
      case 'MantleRpcScanningService':
        service = new MantleRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'EVMRpcScanningV5Service':
        service = new EVMRpcScanningV5Service(
          chainId,
          ctx
        );
        break;
      case 'EVMRpcScanningService':
      case 'EVMRpcScanningV6Service':
        service = new EVMRpcScanningV6Service(
          chainId,
          ctx
        );
        break;
      case 'ArbitrumRpcScanningService':
        service = new ArbitrumRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'OptimisticRpcScanningService':
        service = new OptimisticRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'BaseRpcScanningService':
        service = new BaseRpcScanningService(
          chainId,
          ctx
        );
        break;
      case 'StarknetRpcScanningService':
        service = new StarknetRpcScanningService(
          chainId,
          ctx
        );
        break;
      default:
        throw new Error(`${chainId} Not Config RPC Service Class`);
    }
    this.services[chainId] = service;
    service.init()
    return this.services[chainId];
  }

  async getRpcStatusByChain(chainId: string) {
    const factory = await this.services[chainId];
    if (!factory) {
      throw new Error(`${chainId} factory not found`)
    }
    const latestBlockNumber = factory.rpcLastBlockNumber;
    const lastScannedBlockNumber = await factory.dataProcessor.getNextScanMaxBlockNumber()
    return {
      chainId: factory.chainId,
      latestBlockNumber,
      lastScannedBlockNumber,
      behind: latestBlockNumber - lastScannedBlockNumber,
      processingCount: factory.dataProcessor.getProcessingCount(),
      waitBlockCount: factory.dataProcessor.getDataCount(),
    };
  }
  async getRpcStatus() {
    const services = await this.services;
    const result = {
    }
    for (const chainId in services) {
      try {
        result[chainId] = await this.getRpcStatusByChain(chainId);
      } catch (error) {
        console.error(`${chainId} getRpcStatus error`, error);
      }
    }
    return result;
  }
}
