import { Injectable, Inject } from '@nestjs/common';
import { IChainConfig, Token } from './config.interface'
import { equals } from '@orbiter-finance/utils'
import { ConsulService } from 'libs/nestjs-consul/src/index'
import { ConfigService } from '@nestjs/config';
@Injectable()
export class ChainConfigService {

    constructor(
        private readonly consul: ConsulService<any>,
        private readonly configService: ConfigService
    ) {
    }
    get configs() {
        const name = this.configService.get('ENV_CHAINS_CONFIG_PATH') || 'chains';
        return this.format(this.consul.configs[name]);
    }
    format(configList: Array<IChainConfig>) {
        if (!configList) {
            return [];
        }
        const chains = configList.map((chain: IChainConfig) => {
            chain.internalId = +chain.internalId;
            chain.tokens =
                chain.tokens?.map((row: Token) => {
                    row.isNative = equals(row.address, chain.nativeCurrency.address);
                    return row;
                }) || [];
            if (
                chain.tokens.findIndex((token) =>
                    equals(token.address, chain.nativeCurrency.address),
                ) == -1
            ) {
                chain.tokens.unshift({
                    id: chain.nativeCurrency.id,
                    name: chain.nativeCurrency.name,
                    symbol: chain.nativeCurrency.symbol,
                    decimals: chain.nativeCurrency.decimals,
                    address: chain.nativeCurrency.address,
                    isNative: true,
                });
            }
            chain.features = chain.features || [];
            return chain;
        });
        return chains;
    }
    /**
     * getChainInfo
     * @param chainId number by InternalId, string by network chainId
     * @returns IChainConfig
     */
    getChainInfo(chainId: string | number): IChainConfig | undefined {
        let chain;
        if (typeof chainId == 'string') {
            chain = this.getChainByKeyValue('chainId', chainId);
        } else if (typeof chainId === 'number') {
            chain = this.getChainByKeyValue('internalId', chainId);
        }
        return chain;
    }
    getTokenByChain(
        chainId: string | number,
        addrOrId: string | number,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (!chain) {
            return undefined;
        }
        if (typeof addrOrId === 'string') {
            if (equals(chain.nativeCurrency.address, addrOrId)) {
                chain.nativeCurrency.isNative = true;
                return chain.nativeCurrency;
            }
            return chain.tokens.find((t) => equals(t.address, addrOrId));
        } else if (typeof addrOrId === 'number') {
            if (equals(chain.nativeCurrency.id, addrOrId)) {
                chain.nativeCurrency.isNative = true;
                return chain.nativeCurrency;
            }
            return chain.tokens.find((t) => equals(t.id, addrOrId));
        }
    }
    getTokenByAddress(
        chainId: string | number,
        tokenAddress: string,
    ): Token | undefined {
        return this.getTokenByChain(chainId, tokenAddress);
    }

    getTokenBySymbol(
        chainId: string | number,
        symbol: string,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (!chain) {
            return undefined;
        }
        if (equals(chain.nativeCurrency.symbol, symbol)) {
            chain.nativeCurrency.isNative = true;
            return chain.nativeCurrency;
        }
        return chain.tokens.find((t) => equals(t.symbol, symbol));
    }
    /**
     * Get By Chain Main Token
     * @param chainId chainId
     * @returns Main Token Address
     */
    getChainMainToken(chainId: string | number) {
        const chain = this.getChainInfo(chainId);
        return chain && chain.nativeCurrency;
    }
    /**
     * Valid is MainToken
     * @param chainId chainId
     * @param tokenAddress tokenAddress
     * @returns is MainToken true | false
     */
    inValidMainToken(chainId: string | number, tokenAddress: string) {
        const chainInfo = this.getChainInfo(chainId);
        return equals(chainInfo?.nativeCurrency.address, tokenAddress);
    }

    getAllChains(): IChainConfig[] {
        return this.configs || [];
    }
    getChainByKeyValue(
        key: keyof IChainConfig,
        value: any,
    ): IChainConfig | undefined {
        const allChains = this.getAllChains();
        const chain: IChainConfig | undefined = allChains.find((chain) =>
            equals(chain[key], value),
        );
        return chain;
    }
    getChainTokenByKeyValue(
        chainId: string | number,
        key: keyof Token,
        value: any,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (chain) {
            if (equals(chain.nativeCurrency[key], value)) {
                const token = chain.nativeCurrency;
                token.isNative = true;
                return token;
            }
            const token = chain.tokens.find((t) => equals(t[key], value));
            return token;
        }
    }
}
