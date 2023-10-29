import { ChainConfigService } from '@orbiter-finance/config';
import { ApiScanningFactory } from '../api-scanning/api-scanning.factory';
import { Controller, Get, Param } from '@nestjs/common';
import { RpcScanningFactory } from '../rpc-scanning/rpc-scanning.factory';
import { BigIntToString, JSONStringify } from '@orbiter-finance/utils';
import { RpcCheckService } from './rpc-check.service';
@Controller('scanning')
export class ScanningController {
  constructor(
    private rpcScanningFactory: RpcScanningFactory,
    private apiScanningFactory: ApiScanningFactory,
    protected chainConfigService: ChainConfigService,
    private rpcCheckService: RpcCheckService
  ) { }
  @Get('/status')
  async rpcStatus() {
    return {
      errno: 0,
      data: await this.rpcCheckService.getRpcStatus()
    }
  }
  // @Get('/owners')
  // async owners() {
  //   let startTime = Date.now();
  //   return {
  //     errno: 0,
  //     data: {
  //       owners: await this.makerService.getV1MakerOwners(),
  //       responses: await this.makerService.getV1MakerOwnerResponse()
  //     },
  //     response: (Date.now() - startTime) / 1000
  //   }
  // }
  @Get('/status/:chainId')
  async status(@Param() params) {
    const { chainId } = params;
    try {
      const startTime = Date.now();
      const factory = this.rpcScanningFactory.createService(chainId);
      if (!factory) {
        throw new Error('factory not found')
      }
      const latestBlockNumber = await factory.getLatestBlockNumber();
      const localLatestBlockNumber = factory.rpcLastBlockNumber;
      const lastScannedBlockNumber = await factory.dataProcessor.getNextScanMaxBlockNumber()
      return {
        errno: 0,
        data: {
          chainId: factory.chainId,
          latestBlockNumber,
          localLatestBlockNumber,
          lastScannedBlockNumber,
          behind: latestBlockNumber - lastScannedBlockNumber,
          processingCount: factory.dataProcessor.getProcessingCount(),
          waitBlockCount: factory.dataProcessor.getDataCount(),
          rate: factory.getRate(),
        },
        timestamp: Date.now(),
        response: (Date.now() - startTime) / 1000
      };
    } catch (error) {
      return {
        errno: 1000,
        errmsg: error.message,
      };
    }
  }
  @Get('/rpc-scan/:chainId/:block')
  async manualScanBlocks(@Param() params: any) {
    console.log(params);
    const chainId = params['chainId'];
    const block = params['block'];
    const factory = this.rpcScanningFactory.createService(chainId);
    const result = await factory.manualScanBlocks([+block]);
    return JSON.parse(JSONStringify(result));
  }
  // @Get('/api-scan/:chainId/:address')
  // async apiScan(@Param() params, @Query() query: any) {
  //   const { chainId, address } = params;
  //   const factory = this.apiScanningFactory.createService(chainId);
  //   const { error, transfers } = await factory.getTransactions(address, query);
  //   if (!error && transfers.length > 0) {
  //     const result =
  //       await this.transactionService.execCreateTransactionReceipt(transfers);
  //     return BigIntToString(result);
  //   }
  //   return BigIntToString(transfers);
  // }
}
