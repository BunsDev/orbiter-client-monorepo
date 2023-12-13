import { Controller, Get } from '@nestjs/common';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';
import { ChainsService } from './chains.service';
import { TokenService } from './token.service';
@Controller('tokens')
export class TokensController {
    constructor(private chainService: ChainsService, private readonly tokenService:TokenService) {
    }
    @Get()
    @success('success', 200)
    async index() {
        const tokens = await this.tokenService.getTokens();
        return tokens;
    }
}
