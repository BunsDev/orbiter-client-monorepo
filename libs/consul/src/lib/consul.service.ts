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
    const result:any = await this.consulClient.kv.get(key);
    if (result) {
      return new KeyValueResult(result.Value);
    }
  }
  async set(key: string, value: string): Promise<void> {
    await this.consulClient.kv.set(key, value);
  }
  watchConsulConfig(keyPrefix:string, callback:any) {
    const client = this.consulClient;
    const watcher = client.watch({
      method: client.kv.get,
      options: {
        key: keyPrefix,
      },
    });
  
    watcher.on('change', (data, res) => {
      if (data) {
        callback(data);
      }
    });
  
    watcher.on('error', (err) => {
      console.error('Consul Watcher Error:', err);
    });
  
    return function stopWatching() {
      watcher.end(); // 停止监视
    };
  }
  watchKey(key: string, callback: (newValue: KeyValueResult) => void) {
    const opts:any = {
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
    return watch;
  }

  async watchFolder(folderKey: string, callback: (newValue: { [key: string]: KeyValueResult }) => void): Promise<void> {
    const keys: string[] = await this.consulClient.kv.keys(folderKey);
    const keyMap:any = {};
    const promises = [];
    const resMap: { [key: string]: KeyValueResult } = {};
    for (const key of keys) {
      promises.push(new Promise((resolve) => {
        try {
          keyMap[key] = this.watchKey(key, function (newValue: KeyValueResult) {
            const makerAddress = key.split(folderKey + '/')[1];
            if (!makerAddress) {
              resolve(null);
            }
            resMap[makerAddress.toLowerCase()] = newValue;
            resolve(newValue);
          });
        } catch (err) {
          console.error(`watchFolder key error ${key}`, err);
          resolve(null);
        }
      }));
    }
    await Promise.all(promises);
    callback(resMap);

    const _this = this;
    setInterval(async () => {
      try {
        // await checkConsul();
        const currentKeys:any = await _this.consulClient.kv.keys(folderKey);
        for (const key of currentKeys) {
          if (!keyMap[key]) {
            console.log(`add consul config ${key}`);
            keyMap[key] = _this.watchKey(key, function (newValue: KeyValueResult) {
              const makerAddress = key.split(folderKey + '/')[1];
              if (!makerAddress) {
                return;
              }
              const obj = {};
              obj[makerAddress.toLowerCase()] = newValue;
              callback(obj);
            });
          }
        }
        for (const key in keyMap) {
          if (!currentKeys.find(item => item === key)) {
            console.log(`delete consul config ${key}`);
            keyMap[key].end();
            delete keyMap[key];
          }
        }
      } catch (e) {
        console.error('watch new config error', e);
      }
    }, 30000);
  }
}
