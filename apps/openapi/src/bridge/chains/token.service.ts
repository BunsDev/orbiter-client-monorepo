import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';
import {tokens} from '../../assets/tokens.json'
import tokensExtended from '../../assets/tokens-extended.json'

@Injectable()
export class TokenService {
    constructor(private chainConsulService: ChainConfigService) {
    }
    async getTokens() {
        return Object.assign(tokensExtended, tokens);
    }
}
