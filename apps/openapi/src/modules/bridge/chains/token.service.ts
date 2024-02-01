import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';
// import {tokens} from '../../assets/tokens.json'
import tokensExtended from '../../../assets/tokens-extended.json'

@Injectable()
export class TokenService {
    constructor(private chainConsulService: ChainConfigService) {
    }
    async getTokens() {
        const chains = await this.chainConsulService.getAllChains();
        const result =  {};
        for (const chain of chains) {
            const tokens = [
            ];
            if (chain.tokens) {
                tokens.push(...chain.tokens);
            }
            result[chain.chainId] = tokens;
        }
        return result;
        // return Object.assign(tokensExtended, tokens);
    }
}
