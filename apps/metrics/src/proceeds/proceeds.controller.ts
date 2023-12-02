import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import { ProceedsService } from './proceeds.service';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";

@Controller("proceeds")
export class ProceedsController extends PrometheusController {
    constructor(private proceedsService: ProceedsService, @InjectMetric("orbiterProceeds") public counter: Gauge<string>,) {
        super();
    }
    @Get('/metrics')
    async index(@Res({ passthrough: false }) response: Response) {
        const result = await this.proceedsService.getTodayProceeds();
        for (const row of result) {
            const { targetChainName,targetChain, currencyData } = row;
            if (currencyData) {
                this.counter.labels({
                    "network": targetChainName || targetChain,
                    "currency": currencyData.currency,
                }).set(currencyData.proceeds);
            }
        }

        return super.index(response);
    }
}
