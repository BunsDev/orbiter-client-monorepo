import { Controller, Get, Param, Query } from '@nestjs/common';
import { RoutersService } from './routers.service';
import { success, error } from 'apps/openapi/src/shared/decorators/responser.decorator';
import { v1MakerUtils } from '@orbiter-finance/utils'
import { CustomError } from '../../../shared/errors/custom.error'
import { ChainsService } from '../chains/chains.service';

@Controller('routers')
export class RoutersController {
    constructor(private readonly routerService: RoutersService, private readonly chainService: ChainsService) {

    }
    @Get("/v1")
    @success('success', 200)
    async getRouterV1() {
        const configs = await this.routerService.getV1Routers();
        return configs;
    }
    @Get("/cross-chain")
    @success('success', 200)
    async getCrossChainRouters() {
        const configs = await this.routerService.getV1Routers();
        return configs.filter(config => {
            const lines = config.line.split('-')[1].split('/');
            return lines[0] == lines[1];
        });
    }
    @Get("/swap")
    @success('success', 200)
    async getSwapRouters() {
        const configs = await this.routerService.getV1Routers();
        return configs.filter(config => {
            const lines = config.line.split('-')[1].split('/');
            return lines[0] != lines[1];
        });
    }
    @Get("/dealer/:dealer")
    @success('success', 200)
    async getRouterV3(@Param("dealer") dealer: string) {
        const configs = await this.routerService.getV3Routers(dealer);
        return configs;
    }

    @Get("/simulation/receiveAmount")
    @success('success', 200)
    async simulationRule(@Query('line') line: string, @Query('value') value: string, @Query('nonce') nonce: string) {
        const configs = await this.routerService.getV1Routers();
        const route = configs.find(rule => rule.line === line);
        if (!route) {
            throw new Error('Config not found');
        }
        const chains = await this.chainService.getChains();
        const sourceChain = chains.find(row => row.chainId == route.srcChain);
        const targetChain = chains.find(row => row.chainId == route.tgtChain);
        const sourceToken = sourceChain.tokens.find(t => t.address == route.srcToken);
        const targetToken = sourceChain.tokens.find(t => t.address == route.tgtToken);
        const toChainId = v1MakerUtils.getAmountFlag(+sourceChain.internalId, value);
        if (+toChainId != +targetChain.internalId) {
            throw new Error('vc security code error');
        }
        const result = v1MakerUtils.getAmountToSend(
            +sourceChain.internalId,
            sourceToken.decimals,
            +targetChain.internalId,
            targetToken.decimals,
            value,
            Number(route.withholdingFee),
            Number(route.tradeFee) / 1000,
            +nonce,
        );
        if (result && result.state) {
            return {
                receiveAmount: result.tAmount,
                router: route
            }
        } else {
            throw new Error(result.errmsg);
        }
    }
}
