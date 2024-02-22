import { Controller, Get, Res } from "@nestjs/common";
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
                    result[`${chainId}-${owner}`] = account.nonceManager.getLocalNonce();
                }

            }
        }
        return result;
    }
}