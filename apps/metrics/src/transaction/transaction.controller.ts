import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from "@willsoto/nestjs-prometheus";
@Controller()
export class TransactionController extends PrometheusController  {
    @Get()
    async index(@Res({ passthrough: true }) response: Response) {
        console.log('hello2')
        return super.index(response);
    }
}
