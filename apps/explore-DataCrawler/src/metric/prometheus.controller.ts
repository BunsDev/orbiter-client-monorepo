import { Controller, Get, Res } from "@nestjs/common";
import { PrometheusController as PrometheusBaseController } from "@willsoto/nestjs-prometheus";
import { Response } from "express";

@Controller()
export class PrometheusController extends PrometheusBaseController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}