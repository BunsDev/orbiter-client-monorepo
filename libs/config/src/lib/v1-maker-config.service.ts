import { Injectable, Inject } from '@nestjs/common';
import { isEqual } from 'lodash';
import { KeyValueResult } from 'libs/consul/src/lib/keyValueResult';
import { ConsulService } from 'libs/consul/src/lib/consul.service';
import { Logger } from '@nestjs/common';
import { IMakerConfig } from './config.interface';
import { ORBITER_CONFIG_MODULE_OPTS } from '../lib/config.constants';
import { ConfigModuleOptions } from '../lib/config.interface';

@Injectable()
export class V1MakerConfigService {
  private static makerConfig: IMakerConfig = {};

  constructor(
    private readonly consul: ConsulService,
    @Inject(ORBITER_CONFIG_MODULE_OPTS) private readonly options: ConfigModuleOptions
  ) {
  }

  async init(callback: (makerConfig: IMakerConfig) => void) {
    return new Promise(async (resolve)=>{
      try {
        await this.consul.watchFolder(
          this.options.tradingPairsPath,
          (config: { [key: string]: KeyValueResult }) => {
            for (const key in config) {
              if (!key) continue;
              const kv: KeyValueResult = config[key];
              V1MakerConfigService.makerConfig[key] = kv.toJSON();
            }
            callback(V1MakerConfigService.makerConfig);
            resolve(V1MakerConfigService.makerConfig)
          },
        );
      } catch (error: any) {
        Logger.error(
          `watch config change error ${error.message}`,
          error.stack,
        );
        resolve({});
      }
    })
  }

  getMakerConfig() {
    return V1MakerConfigService.makerConfig;
  }
}
