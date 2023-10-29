import { Controller, Get, Res } from "@nestjs/common";
import { PrometheusController as PrometheusBaseController } from "@willsoto/nestjs-prometheus";
import { Response } from "express";
import { makeGaugeProvider } from "@willsoto/nestjs-prometheus";

@Controller()
export class PrometheusController extends PrometheusBaseController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
  @Get("/rpc/metric")
  async rpcMetric(@Res({ passthrough: true }) response: Response) {
  }
}