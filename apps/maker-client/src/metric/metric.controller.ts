import { Controller, Get, Res } from "@nestjs/common";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
import {MetricService} from './metric.service';
@Controller()
export class MetricController extends PrometheusController {
    constructor(private readonly metricService:MetricService) {
        super();
    }
    @Get('/metrics')
    async index(@Res({ passthrough: false }) response: any) {
        await this.metricService.setPendingTransfer()
        return super.index(response);
    }

}