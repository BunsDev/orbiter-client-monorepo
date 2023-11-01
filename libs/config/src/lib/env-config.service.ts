import { ConfigService } from '@nestjs/config';
import { get, set, clone, isEmpty, isEqual } from 'lodash';
import { Inject, Injectable } from '@nestjs/common';
import { sleep } from './utils'
import { KeyValueResult } from 'libs/consul/src/lib/keyValueResult';
import { ConsulService } from 'libs/consul/src/lib/consul.service'
import { Logger } from '@nestjs/common';
function getConfig(name: string) {
    return get(ENVConfigService.configs, name);
}
import { ORBITER_CONFIG_MODULE_OPTS } from './config.constants';
import { ConfigModuleOptions } from './config.interface';
@Injectable()
export class ENVConfigService {
    public static configs: any;
    #init: boolean = false;
    constructor(
        private readonly consul: ConsulService,
        private readonly configService: ConfigService,
        @Inject(ORBITER_CONFIG_MODULE_OPTS) private readonly options: ConfigModuleOptions
    ) {
        ENVConfigService.configs = {};
        if (this.options.envConfigPath) {
            try {
                this.consul.watchConsulConfig(
                    this.options.envConfigPath,
                    (config: KeyValueResult) => {
                        const data = config.yamlToJSON();
                        this.#init = true;
                        if (data) {
                            ENVConfigService.configs = data;
                            // this.write();
                        }
                    },
                );
            } catch (error) {
                Logger.error(
                    `watch config change error ${this.options.envConfigPath}`,
                    error,
                );
            }
        }

    }
    get<T = any>(name: string): T {
        if (!isEmpty(this.configService.get(name))) {
            return this.configService.get(name) as T;
        }
        return getConfig(name);
    }
    async initAsync(key:string): Promise<void> {
        if (!this.#init) {
            await sleep(1000);
            console.warn(`Configuration does not exist ${key} ${this.#init}`)
            return await this.initAsync(key);
        }
    }
    async getAsync<T = any>(name: string): Promise<T> {
        if (!isEmpty(this.configService.get(name))) {
            return this.configService.get(name) as T;
        }
        await this.initAsync(name);
        return getConfig(name);
    }
    getCloudConfig() {
        return ENVConfigService.configs;
    }
    // async set(name: string, value: any) {
    //     set(ENVConfigService.configs, name, value);
    //     await this.write();
    // }
    // async write() {
    //     if (isEmpty(ENVConfigService.configs)) {
    //         throw new Error('no configuration to write');
    //     }
    //     const envConfigPath = this.options.envConfigPath;
    //     if (!envConfigPath) {
    //         throw new Error('Missing configuration path');
    //     }
    //     if (!this.options.cachePath) {
    //         return console.warn('Missing cache path');
    //     }
    //     if (ENVConfigService.configs) {
    //         const cloneConfig = clone(ENVConfigService.configs);
    //         delete cloneConfig['privateKey'];
    //         const data = yaml.dump(cloneConfig);
    //         const filePath = join(this.options.cachePath, envConfigPath);
    //         await outputFile(filePath, data);
    //     }
    // }
}
