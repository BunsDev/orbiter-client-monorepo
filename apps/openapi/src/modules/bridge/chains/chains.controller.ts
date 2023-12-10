import { Controller, Get } from '@nestjs/common';
import { ChainsService } from './chains.service';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';
@Controller('chains')
export class ChainsController {
    constructor(private chainService: ChainsService) {
    }
    @Get()
    @success('success', 200)
    async index() {
        return await this.chainService.getChains();
    }
}
