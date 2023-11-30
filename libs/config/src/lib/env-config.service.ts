import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sleep } from './utils';
import { KeyValueResult } from 'libs/consul/src/lib/keyValueResult';
import { ConsulService } from 'libs/consul/src/lib/consul.service';
import { ConfigModuleOptions } from './config.interface';
import { ORBITER_CONFIG_MODULE_OPTS } from './config.constants';
import { get } from 'lodash';
@Injectable()
export class ENVConfigService {
  private configs: any = {};
  private isInitialized: boolean = false;
  private count: number = 0;
  constructor(
    private readonly consul: ConsulService,
    private readonly configService: ConfigService,
    @Inject(ORBITER_CONFIG_MODULE_OPTS) private readonly options: ConfigModuleOptions,
  ) {
    if (this.options.envConfigPath) {
      this.initializeConfigWatcher(this.options.envConfigPath);
    }
  }

  private initializeConfigWatcher(configFile: string) {
    try {
      this.consul.watchConsulConfig(
        configFile,
        (config: KeyValueResult) => {
          if (config) {
            const data = config.yamlToJSON();
            if (data) {
              this.configs = data;
              this.isInitialized = true;
            }
          } else {
            Logger.error(`Watch config change null ${configFile}`);
          }
        },
      );
    } catch (error) {
      Logger.error(`Watch config change error ${configFile}`, error);
    }
  }

  async initAsync(key: string): Promise<void> {
    if (!this.isInitialized) {
      await sleep(1000);
      if (this.count >= 60) {
        throw new Error(`Configuration does not exist: ${key}`);
      }
      return await this.initAsync(key)
    }
  }

  get<T = any>(name: string, defaultValue?: T): T {
    if (!this.configService.get(name)) {
      return (get(this.configs, name) || defaultValue) as T;
    }
    return (this.configService.get(name) || defaultValue) as T;
  }

  async getAsync<T = any>(name: string, defaultValue?: T): Promise<T> {
    await this.initAsync(name);
    return this.get(name, defaultValue);
  }

  getCloudConfig() {
    return this.configs;
  }
}
