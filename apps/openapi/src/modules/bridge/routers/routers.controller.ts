import { Controller, Get, Param, Query } from '@nestjs/common';
import { RoutersService } from './routers.service';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';
@Controller('routers')
export class RoutersController {
    constructor(private readonly routerService:RoutersService) {

    }
    @Get("/v1")
    @success('success', 200)
    async getRouterV1() {
        const configs = await this.routerService.getV1Routers();
        return configs;
    }
    @Get("/v3/dealer/:dealer")
    @success('success', 200)
    async getRouterV3(@Param("dealer") dealer:string) {
        const configs = await this.routerService.getV3Routers(dealer);
        return configs;
    }
}
