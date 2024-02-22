import { Controller, Get, Res,Query } from "@nestjs/common";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import { MetricService } from './metric.service';
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { AccountFactoryService } from '../factory'
@Controller()
export class MetricController extends PrometheusController {
    constructor(private readonly metricService: MetricService,
        private readonly envConfig: ENVConfigService,
        private readonly chainConfigService: ChainConfigService,
        private readonly accountFactoryService: AccountFactoryService
    ) {
        super();
    }
    @Get('/metrics')
    async index(@Res({ passthrough: false }) response: any) {
        await this.metricService.setPendingTransfer()
        return super.index(response);
    }

    @Get('/nonces')
    async noncs() {
        const owners = this.envConfig.get("ENABLE_PAID_MAKERS") || [];
        let chainIds = this.envConfig.get("ENABLE_PAID_CHAINS") || [];
        if (chainIds.includes('*')) {
            chainIds = this.chainConfigService.getAllChains().map(item => item.chainId);
        }
        const result = {

        }
        for (const chainId of chainIds) {
            for (const owner of owners) {
                // read db history
                const account = await this.accountFactoryService.createMakerAccount(
                    owner,
                    chainId
                );
                if (account && account.nonceManager) {
                    result[`${chainId}-${owner}`] = await account.nonceManager.getLocalNonce();
                }

            }
        }
        return result;
    }
    @Get('/changeNonce')
    async changeNonce(@Query() query:any) {
        try {
            const chainId = query['chainId'];
            const value = +query['value'];
            const owner = query['owner'];
            if (!chainId) {
                throw new Error('ChainId parameter missing')
            }
            if (!value) {
                throw new Error('Value parameter missing')
            }
            if (!owner) {
                throw new Error('Owner parameter missing')
            }
            const account = await this.accountFactoryService.createMakerAccount(
                owner,
                chainId
            );
            if (!account || !account.nonceManager) {
                throw new Error('The initialized NonceManager instance was not obtained');
            }
            const current = await account.nonceManager.getLocalNonce();
            const result = await account.nonceManager.setNonce(value);
            return {
                errno:0,
                errmsg: 'success',
                data: {
                    current,
                    last: value
                }
            }
        }catch(error) {
            return {
                errno:1000,
                errmsg: error.message,
            }
        }
    
    }
}