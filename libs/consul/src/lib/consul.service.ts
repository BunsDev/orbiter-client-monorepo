import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { CONSUL_OPTIONS } from './consul.constants';
import { ConsulOptions } from './consul.interface';
import Consul from 'consul';
import { KeyValueResult } from './keyValueResult';
@Injectable()
export class ConsulService implements OnModuleInit {
  public readonly consulClient!: Consul.Consul;
  constructor(@Inject(CONSUL_OPTIONS) private readonly options: ConsulOptions) {
    this.consulClient = new Consul({
      host: this.options.host,
      port: String(this.options.port),
      defaults: this.options.defaults,
      promisify: true,
    });
  }

  onModuleInit() {
    // this.consulClient.agent.service.register({
    //     name: String(this.options.name),
    //     status: "passing"
    // }).catch(error=> {
    //   console.error('onModuleInit fail', error);
    // })
  }

  async get(key: string): Promise<KeyValueResult | void> {
    const result = await this.consulClient.kv.get(`${this.options.nameSpace || ""}${key}`);
    if (result && typeof result === 'object') {
      return new KeyValueResult((result as any)['Value']);
    }
  }
  async set(key: string, value: string): Promise<void> {
    await this.consulClient.kv.set(`${this.options.nameSpace || ""}${key}`, value);
  }
  async keys(key: string): Promise<string[]> {
    const path = `${this.options.nameSpace || ""}${key}`;
    const keys: string[] = await this.consulClient.kv.keys(path);
    return keys;
  }

  watchConsulConfig(keyPrefix: string, callback: any) {
    const client = this.consulClient;

    const opts: any = {
      key: keyPrefix,
    };
    if (this.options.nameSpace && !keyPrefix.includes(this.options.nameSpace)) {
      opts.key = `${this.options.nameSpace}${keyPrefix}`;
    }
    if (this.options.defaults && this.options.defaults.token) {
      opts['token'] = this.options.defaults.token;
    }
    const watcher = client.watch({
      method: client.kv.get,
      options: opts
    });

    watcher.on('change', (data, res) => {
      if (data) {
        return callback(new KeyValueResult(data.Value));
      }
    });

    watcher.on('error', (err) => {
      console.error(`Consul Watcher Error: ${keyPrefix}`, err);
      return callback(null, err);
    });

    return function stopWatching() {
      watcher.end(); // stop
    };
  }
}
