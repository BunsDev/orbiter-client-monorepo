import { Controller, Get, Res, Param } from "@nestjs/common";
import { JSONStringify } from '@orbiter-finance/utils';
import { RpcScanningFactory } from './rpc-scanning/rpc-scanning.factory';
@Controller()
export class AppController {
    constructor(private rpcScanningFactory: RpcScanningFactory,
    ) {
    }
    @Get('/status')
    async rpcStatus() {
        return {
            errno: 0,
            data: await this.rpcScanningFactory.getRpcStatus()
        }
    }
    @Get('/status/:chainId')
    async status(@Param() params) {
        const { chainId } = params;
        try {
            const startTime = Date.now();
            return {
                errno: 0,
                data: await this.rpcScanningFactory.getRpcStatusByChain(chainId),
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
}
