import { get, set, clone, isEmpty, isEqual ,groupBy} from 'lodash';
import { Inject, Injectable } from '@nestjs/common';
import { outputFile } from 'fs-extra';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { ConsulService } from 'libs/consul/src/lib/consul.service'
import { Logger } from '@nestjs/common';
function getConfig(name: string) {
    return get(MakerV1RuleService.configs, name);
}
import { ORBITER_CONFIG_MODULE_OPTS } from './config.constants';
import { ConfigModuleOptions } from './config.interface';
@Injectable()
export class MakerV1RuleService {
    public static configs: any = {};
    private configPath: string;
    constructor(
        private readonly consul: ConsulService,
        @Inject(ORBITER_CONFIG_MODULE_OPTS) private readonly options: ConfigModuleOptions
    ) {
        this.configPath = this.options.makerV1RulePath || "";
        this.init()
    }
    async init() {
        if (this.configPath) {
            try {
                const keys: string[] = await this.consul.keys(this.configPath)
                if (keys.length<2) {
                    return console.warn('rules/files not config');
                }
                for (let i = 1; i < keys.length; i++) {
                    try {
                        this.consul.watchConsulConfig(keys[i], (data: any) => {
                            MakerV1RuleService.configs[data.Key] = JSON.parse(data.Value);
                        })
                    } catch (error) {
                        Logger.error(
                            `watch config change error ${error.message} ${keys[i]}`,
                            error,
                        );
                    }
                }
            } catch (error) {
                console.error(error);
                Logger.error(
                    `watch config change error ${error.message} ${this.configPath}`,
                    error,
                );
            }
        }
    }
    get<T = any>(name: string): T {
        return getConfig(name);
    }
    getAll() {
        const configs = MakerV1RuleService.configs;
        if (configs) {
            const makerRules = [];
            for (const file in configs) {
                const fileConfig = configs[file];
                for (const chainId in fileConfig) {
                    const chains = chainId.split('-');
                    for (const symbolId in fileConfig[chainId]) {
                        const ruleConfig = fileConfig[chainId][symbolId];
                        const symbols = symbolId.split('-');
                        makerRules.push({
                            ...ruleConfig,
                            chain: chainId,
                            token: symbolId,
                            sourceChainId: chains[0],
                            targetChainId: chains[1],
                            sourceSymbol: symbols[0],
                            targetSymbol: symbols[1],
                        });
                    }
                }
            }
            return makerRules;
        }
        return [];
    }
    async set(name: string, value: any) {
        set(MakerV1RuleService.configs, name, value);
        await this.write();
    }
    async write() {
        if (isEmpty(MakerV1RuleService.configs)) {
            throw new Error('no configuration to write');
        }
        const chainConfigPath = this.configPath;
        if (!chainConfigPath) {
            throw new Error('Missing configuration path');
        }
        if (!this.options.cachePath) {
            return console.warn('Missing cache path');
        }
        if (MakerV1RuleService.configs) {
            const cloneConfig = clone(MakerV1RuleService.configs);
            delete cloneConfig['privateKey'];
            const data = yaml.dump(cloneConfig);
            const filePath = join(this.options.cachePath, chainConfigPath);
            await outputFile(filePath, data);
        }
    }
}
