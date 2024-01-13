import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sleep } from './utils';
import { ConsulService } from 'libs/nestjs-consul/src/index';
import { get } from 'lodash';
@Injectable()
export class ENVConfigService {
  private isInitialized: boolean = false;
  private count: number = 0;
  constructor(
    private readonly consul: ConsulService<any>,
    private readonly configService: ConfigService
  ) {
    this.isInitialized = true;
  }
  get configs() {
    return this.consul.configs[this.configService.get('ENV_VAR_PATH') || 'config'] || {};
  }
  async initAsync(key: string): Promise<void> {
    if (!this.isInitialized) {
      await sleep(1000);
      if (this.count >= 10) {
        throw new Error(`Configuration does not exist: ${key}`);
      }
      this.count++;
      return await this.initAsync(key)
    }
  }

  get<T = any>(name: string, defaultValue?: T): T {
    this.count = 0;
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
    return this.consul.configs['config'] || {};
  }
}
