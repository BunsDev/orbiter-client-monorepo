import { Controller, Get, Res } from "@nestjs/common";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
@Controller("metric")
export class MetricController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: any) {
    return super.index(response);
  }
}
