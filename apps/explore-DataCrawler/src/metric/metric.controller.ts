import { Controller, Get, Res, Param } from "@nestjs/common";
import { PrometheusController } from "@willsoto/nestjs-prometheus";
@Controller("metric")
export class MetricController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: any) {
    return super.index(response);
  }
  @Get("hello")
  findAll(): string {
    return 'This action returns all cats';
  }
}
