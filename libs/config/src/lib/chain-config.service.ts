import { Injectable, Inject } from '@nestjs/common';
import { isEqual } from 'lodash';
import { KeyValueResult } from 'libs/consul/src/lib/keyValueResult';
import { ConsulService } from 'libs/consul/src/lib/consul.service'
import { Logger } from '@nestjs/common';
import { IChainConfig, Token } from './config.interface'
import { equals } from 'libs/utils/src'
import { ORBITER_CONFIG_MODULE_OPTS } from '../lib/config.constants'
import { ConfigModuleOptions } from '../lib/config.interface'
@Injectable()
export class ChainConfigService {
    private static configs: Array<IChainConfig> = [];
    constructor(
        private readonly consul: ConsulService,
        @Inject(ORBITER_CONFIG_MODULE_OPTS) private readonly options: ConfigModuleOptions
    ) {
        ChainConfigService.configs = [];
        if (this.options.chainConfigPath) {
            try {
                this.consul.watchConsulConfig(
                    this.options.chainConfigPath,
                    (config: KeyValueResult) => {
                        const data = config.toJSON();
                        if (!isEqual(data, ChainConfigService.configs)) {
                            ChainConfigService.configs = data;
                            // this.write();
                        }
                    },
                );
            } catch (error: any) {
                Logger.error(
                    `watch config change error ${this.options.chainConfigPath}`,
                    error,
                );
            }
        }

    }

    fill(configList: Array<IChainConfig>) {
        const chains = configList.map((chain: IChainConfig) => {
            if (!chain.workingStatus) {
                chain.workingStatus = 'stop';
            }
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
        ChainConfigService.configs = chains;
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
        return ChainConfigService.configs || [];
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

    // async write() {
    //     if (isEmpty(ChainConfigService.configs)) {
    //         throw new Error('no configuration to write');
    //     }
    //     const chainConfigPath = this.options.chainConfigPath;
    //     if (!chainConfigPath) {
    //         throw new Error('Missing configuration path');
    //     }
    //     if(!this.options.cachePath) {
    //         return console.warn('Missing cache path');
    //     }
    //     if (ChainConfigService.configs) {
    //         const data = JSON.stringify(ChainConfigService.configs);
    //         const filePath = join(this.options.cachePath, chainConfigPath);
    //     }
    // }
}
