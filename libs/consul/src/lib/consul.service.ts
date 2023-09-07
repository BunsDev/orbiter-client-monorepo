import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { CONSUL_OPTIONS } from './consul.constants';
import { ConsulOptions } from './consul.interface';
import Consul from 'consul';
import { KeyValueResult } from './keyValueResult';
@Injectable()
export class ConsulService implements OnModuleInit {
  private consulClient!: Consul.Consul;

  constructor(@Inject(CONSUL_OPTIONS) private readonly options: ConsulOptions) {
    this.consulClient = new Consul({
      host: this.options.host,
      port: this.options.port,
      defaults: this.options.defaults,
      promisify: true,
    });
  }

  onModuleInit() {
    // this.consulClient.agent.service.register({
    //     name: this.options.name,
    //     status: "passing"
    // });
  }

  async get(key: string): Promise<KeyValueResult> {
    const result = await this.consulClient.kv.get(key);
    if (result) {
      return new KeyValueResult(result.Value);
    }
  }
  async set(key: string, value: string): Promise<void> {
    await this.consulClient.kv.set(key, value);
  }

  watchKey(key: string, callback: (newValue: KeyValueResult) => void): void {
    const opts = {
      key,
    };
    if (this.options.defaults && this.options.defaults.token) {
      opts['token'] = this.options.defaults.token;
    }
    const watch = this.consulClient.watch({
      method: this.consulClient.kv.get,
      options: opts,
    });
    watch.on('change', async (data: any, _res: any) => {
      if (data) {
        return callback(new KeyValueResult(data.Value));
      }
    });
    watch.on('error', (err) => {
      console.error(`watchConfig error ${key}`, err);
    });
  }
}
