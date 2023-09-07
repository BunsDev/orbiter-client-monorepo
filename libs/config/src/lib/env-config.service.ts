import { get, set, clone, isEmpty, isEqual } from 'lodash';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { sleep } from './utils'
import { KeyValueResult } from 'libs/consul/src/lib/keyValueResult';
import { ConsulService } from 'libs/consul/src/lib/consul.service'
import { Logger } from '@nestjs/common';
const YAML_CONFIG_FILENAME = 'config.yaml';
const NAME_SPACE = 'ENV';
// export function ConfigRegister() {
//     return registerAs(NAME_SPACE, () => {
//         try {
//             return yaml.load(
//                 readFileSync(join(__dirname, YAML_CONFIG_FILENAME), 'utf8'),
//             ) as Record<string, any>;
//         } catch (error: any) {
//             console.error(`init load ${YAML_CONFIG_FILENAME} fail ${error.message}`);
//             return {};
//         }
//     });
// }
export function getConfig(name: string) {
    return get(ENVConfigService.configs, name);
}
import {ORBITER_CONFIG_MODULE_OPTS} from './config.constants';
import {ConfigModuleOptions} from './config.interface';
@Injectable()
export class ENVConfigService {
    public static configs: any;
    //   private readonly logger = Logger(ENVConfigService.name);
    #init: boolean = false;
    constructor(
        private readonly configService: ConfigService,
        private readonly consul: ConsulService
    ) {
        ENVConfigService.configs = this.configService.get(`${NAME_SPACE}`) || {};
        try {
            this.consul.watchKey(
                'explore-data-service/config.yaml',
                (config: KeyValueResult) => {
                    const data = config.yamlToJSON();
                    this.#init = true;
                    if (!isEqual(data, ENVConfigService.configs)) {
                        ENVConfigService.configs = data;
                        this.write();
                    }
                },
            );
        } catch (error) {
            Logger.error(
                `watch config change error ${error.message}`,
                error.stack,
            );
        }
    }
    get<T = any>(name: string): T {
        return getConfig(name);
    }
    async initAsync(): Promise<void> {
        if (!this.#init) {
            await sleep(100);
            return await this.initAsync();
        }
    }
    async getAsync<T = any>(name: string): Promise<T> {
        await this.initAsync();
        return getConfig(name);
    }
    getAll() {
        return ENVConfigService.configs;
    }
    async set(name: string, value: any) {
        set(ENVConfigService.configs, name, value);
        await this.write();
    }
    async write() {
        if (isEmpty(ENVConfigService.configs)) {
            throw new Error('MAKER_CONFIG ISEmpty');
        }
        if (ENVConfigService.configs) {
            const cloneConfig = clone(ENVConfigService.configs);
            delete cloneConfig['privateKey'];
            const data = yaml.dump(cloneConfig);
            const filePath = join(__dirname, YAML_CONFIG_FILENAME);
            await writeFileSync(filePath, data);
        }
    }
}
