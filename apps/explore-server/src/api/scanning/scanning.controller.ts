import { ChainConfigService } from '@orbiter-finance/config';
import { ApiScanningFactory } from './../../api-scanning/api-scanning.factory';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { RpcScanningFactory } from '../../rpc-scanning/rpc-scanning.factory';
import { BigIntToString } from '@orbiter-finance/utils';
import { TransactionService } from '../../transaction/transaction.service';
import { MakerService } from '../../maker/maker.service';
@Controller('scanning')
export class ScanningController {
  constructor(
    private rpcScanningFactory: RpcScanningFactory,
    private apiScanningFactory: ApiScanningFactory,
    protected transactionService: TransactionService,
    protected chainConfigService: ChainConfigService,
    protected makerService: MakerService,
  ) {}
  @Get('/rpc-scan/status')
  async rpcStatus() {
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

            const latestBlockNumber = await factory.getLatestBlockNumber();
            const lastScannedBlockNumber =
              await factory.getLastScannedBlockNumber();
              const blocks =  await factory.getMemoryWaitScanBlockNumbers();
            result[chain.chainId] = {
              chainId: factory.chainId,
              lastScannedBlockNumber,
              latestBlockNumber,
              backward: latestBlockNumber - lastScannedBlockNumber,
              failBlocks:blocks,
              waitBlockCount: blocks.length
              
            };
          }
        } catch (error) {
          console.log(error);
        }
      }
      return {
        errno: 0,
        data: result,
      };
    } catch (error) {
      return {
        errno: 1000,
        errmsg: error.message,
      };
    }
  }
  @Get('/owners')
  async owners() {
    let startTime = Date.now();
    return {
      errno: 0,
      data: {
        owners: await this.makerService.getV1MakerOwners(),
        responses: await this.makerService.getV1MakerOwnerResponse()
      },
      response: (Date.now() - startTime) / 1000
    }
  }
  @Get('/rpc-scan/status/:chainId/')
  async status(@Param() params) {
    const { chainId } = params;
    try {
      let startTime = Date.now();
      const factory = this.rpcScanningFactory.createService(chainId);
      const result = await Promise.all([factory.getLatestBlockNumber(), factory.getLastScannedBlockNumber(), factory.getMemoryWaitScanBlockNumbers()]);
      const latestBlockNumber = +result[0]
      const lastScannedBlockNumber = +result[1];
      const blocks = result[2];
      return {
        errno: 0,
        data: {
          chainId: factory.chainId,
          latestBlockNumber,
          lastScannedBlockNumber,
          backward: latestBlockNumber - lastScannedBlockNumber,
          // failBlocks:blocks,
          waitBlockCount: blocks.length,
        },
        response: (Date.now() - startTime )/ 1000
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
    return BigIntToString(result);
  }
  @Get('/api-scan/:chainId/:address')
  async apiScan(@Param() params, @Query() query: any) {
    const { chainId, address } = params;
    const factory = this.apiScanningFactory.createService(chainId);
    const { error, transfers } = await factory.getTransactions(address, query);
    if (!error && transfers.length > 0) {
      const result =
        await this.transactionService.execCreateTransactionReceipt(transfers);
      return BigIntToString(result);
    }
    return BigIntToString(transfers);
  }
}
