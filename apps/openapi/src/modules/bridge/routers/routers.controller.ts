import { Controller, Get, Param, Query } from '@nestjs/common';
import { RoutersService } from './routers.service';
import { success, error } from 'apps/openapi/src/shared/decorators/responser.decorator';
import { v1MakerUtils } from '@orbiter-finance/utils'
import { CustomError } from '../../../shared/errors/custom.error'
import { ChainsService } from '../chains/chains.service';
import BigNumber from 'bignumber.js';
import { padStart, shuffle } from 'lodash';

@Controller('routers')
export class RoutersController {
    constructor(private readonly routerService: RoutersService, private readonly chainService: ChainsService) {
    }

    @Get()
    @success('success', 200)
    async getRouters(@Query('dealerId') dealerId: string) {
        let routers = [];
        const v1Routers = shuffle(await this.routerService.getV1Routers());
        if (dealerId) {
            try {
                const dealerConfigs = await this.routerService.getV3Routers(dealerId.toLocaleLowerCase()) || [];
                routers.push(...dealerConfigs);
                for (const v1Line of v1Routers) {
                    const data = routers.find(item => item.line === v1Line.line);
                    if (!data) {
                        routers.push(v1Line);
                    }
                }
            } catch (error) {
                console.error('getRouterV1 -> getV3Routers error', error);
            }
        }
        return routers.length <= 0 ? v1Routers : routers;
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

    @Get("/dealer/v1/:dealer")
    @success('success', 200)
    async getDealerRouters(@Param("dealer") dealer: string) {
        const configs = await this.routerService.getV3Routers(dealer);

        return configs;
    }

    @Get("/simulation/receiveAmount")
    @success('success', 200)
    async simulationRule(@Query('line') line: string, @Query('value') value: string, @Query('nonce') nonce: string, @Query('dealer') dealer: string) {
        if (dealer) {
            return this.simulationDealerRule(dealer, line, value, nonce);
        }
        const configs = await this.routerService.getV1Routers();
        const route = configs.find(rule => rule.line === line);
        if (!route) {
            throw new Error(`${line} Router Config not found`);
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
                dealer,
                receiveAmount: result.tAmount,
                router: route
            }
        } else {
            throw new Error(result.errmsg);
        }
    }

    async simulationDealerRule(@Query('dealer') dealer: string, @Query('line') line: string, @Query('value') value: string, @Query('nonce') nonce: string) {
        const configs = await this.routerService.getV3Routers(dealer.toLocaleLowerCase());
        const route = configs.find(rule => rule.line === line);
        if (!route) {
            throw new Error(`${line} Router Config not found`);
        }
        // const chains = await this.chainService.getChains();
        // const sourceChain = chains.find(row => row.chainId == route.srcChain);
        // const targetChain = chains.find(row => row.chainId == route.tgtChain);
        // const sourceToken = sourceChain.tokens.find(t => t.address == route.srcToken);
        // const targetToken = sourceChain.tokens.find(t => t.address == route.tgtToken);
        const vc = this.getSecurityCode(value);
        if (+vc != +route.vc) {
            throw new Error('vc security code error');
        }
        const result = this.getResponseIntent(
            value,
            new BigNumber(route.tradeFee).toFixed(0),
            new BigNumber(route.withholdingFee).toFixed(0),
            nonce,
        );
        if (result && result.code == 0) {
            return {
                dealer,
                receiveAmount: result.responseAmount,
                router: route
            }
        } else {
            console.log(result);
            throw new Error('responseIntent fail');
        }
    }
    private getSecurityCode(value: string): string {
        const code = value.substring(value.length - 5, value.length);
        // const code = new BigNumber(value).mod(100000).toString();
        return code;
    }
    private getResponseIntent(
        amount: string,
        tradeFee: string,
        withholdingFee: string,
        targetSafeCode: string,
    ) {
        const securityCode = this.getSecurityCode(amount);
        const tradeAmount =
            BigInt(amount) - BigInt(securityCode) - BigInt(withholdingFee);
        //  tradeAmount valid max and min
        const tradingFee = (tradeAmount * BigInt(tradeFee)) / 1000000n;
        const responseAmount = ((tradeAmount - tradingFee) / 10000n) * 10000n;
        const responseAmountStr = responseAmount.toString();
        const result = {
            code: 0,
            value: amount,
            tradeAmount: tradeAmount.toString(),
            tradeFee: tradingFee.toString(),
            withholdingFee,
            responseAmountOrigin: responseAmountStr,
            responseAmount: `${responseAmountStr.substring(
                0,
                responseAmountStr.length - 4,
            )}${padStart(targetSafeCode, 4, '0')}`,
        };
        return result;
    }
}
