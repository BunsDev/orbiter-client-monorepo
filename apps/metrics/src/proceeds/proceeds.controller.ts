import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import { ProceedsService } from './proceeds.service';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";
import { sumBy } from 'lodash';

@Controller("proceeds")
export class ProceedsController extends PrometheusController {
    constructor(private proceedsService: ProceedsService, @InjectMetric("orbiterProceeds") public counter: Gauge<string>,) {
        super();
    }
    @Get('/metrics')
    async index(@Res({ passthrough: false }) response: Response) {
        const symbols = ['ETH'];
        for (const symbol of symbols) {
            const result = await this.proceedsService.getTodayProceeds(symbol);
            for (const row of result) {
                const { targetChainName, targetChain, currencyData } = row;
                if (currencyData) {
                    this.counter.labels({
                        "targetChain": targetChainName || targetChain,
                        "targetSymbol": row.targetSymbol,
                        "currency": currencyData.currency,
                    }).set(currencyData.proceeds);
                }
            }
            const total = sumBy(result, row=> {
                return row['currencyData']['proceeds'];
            });
            console.log('总收益：', total);
        }
        return super.index(response);
    }
}
