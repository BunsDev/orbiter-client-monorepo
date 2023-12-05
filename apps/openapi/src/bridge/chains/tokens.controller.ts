import { Controller, Get } from '@nestjs/common';
import {tokens} from '../../assets/tokens.json'
import { success } from '../../decorators/responser.decorator';
@Controller('tokens')
export class TokensController {
    @Get()
    @success('success', 200)
    index() {
        for (const chainId in tokens) {
            const tokensList = tokens[chainId];
            tokens[chainId] = tokensList.splice(0,50);
        }
        return tokens;
    }
}
