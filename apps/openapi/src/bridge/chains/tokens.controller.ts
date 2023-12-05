import { Controller, Get } from '@nestjs/common';
import { success } from '../../decorators/responser.decorator';
import { ChainsService } from './chains.service';
import { TokenService } from './token.service';
@Controller('tokens')
export class TokensController {
    constructor(private chainService: ChainsService, private readonly tokenService:TokenService) {
    }
    @Get()
    @success('success', 200)
    async index() {
        const chains = await this.chainService.getChains();
        const tokens = await this.tokenService.getTokens();
        for (const chainId in tokens) {
            const tokensList = tokens[chainId];
            tokens[chainId] = tokensList.splice(0,50);
        }
        for (const chain of chains) {
            if (!tokens[chain.chainId]) {
                console.log(`${chain.name}-${chain.chainId} 不存在token`);
            }
        }
        
        return tokens;
    }
}
