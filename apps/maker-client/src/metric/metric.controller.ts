import { Controller, Get, Res } from "@nestjs/common";
import { PrometheusController as PrometheusBaseController } from "@willsoto/nestjs-prometheus";

@Controller()
export class MetricController extends PrometheusBaseController {

    @Get()
    async index(@Res({ passthrough: true }) response: any) {
        return super.index(response);
    }

}