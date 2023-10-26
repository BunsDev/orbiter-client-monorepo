import { ChainConfigService } from '@orbiter-finance/config';
import { ApiScanningFactory } from '../../api-scanning/api-scanning.factory';
import { Controller, Get, Param } from '@nestjs/common';
import { RpcScanningFactory } from '../../rpc-scanning/rpc-scanning.factory';
import { BigIntToString, JSONStringify } from '@orbiter-finance/utils';
@Controller('scanning')
export class ScanningController {
  constructor(
    private rpcScanningFactory: RpcScanningFactory,
    private apiScanningFactory: ApiScanningFactory,
    protected chainConfigService: ChainConfigService,
  ) { }
  @Get('/status')
  async rpcStatus() {
    const startTime = Date.now();
    try {
      const result = {};
      for (const chain of this.chainConfigService.getAllChains()) {
        if (!chain.service) {
          continue;
        }
        const serviceKeys = Object.keys(chain.service);
        try {
          if (serviceKeys.includes('rpc')) {
            const factory = this.rpcScanningFactory.createService(
              chain.chainId,
            );
            const result = await Promise.all([factory.rpcLastBlockNumber, factory.dataProcessor.getNextScanMaxBlockNumber(), factory.dataProcessor.getDataCount()]);
            const latestBlockNumber = +result[0]
            const lastScannedBlockNumber = +result[1];
            const waitBlockCount = result[2];
            result[chain.chainId] = {
              chainId: factory.chainId,
              latestBlockNumber,
              lastScannedBlockNumber,
              backward: latestBlockNumber - lastScannedBlockNumber,
              waitBlockCount: waitBlockCount,
            };
          }
        } catch (error) {
          console.log(error);
        }
      }
      return {
        errno: 0,
        data: result,
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
