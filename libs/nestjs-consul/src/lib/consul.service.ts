import { IConsulConfig, IConsulKeys } from './interfaces/consul-config.interface';
import { Logger } from '@nestjs/common';
import { IConsulResponse } from './interfaces/consul-response.interface';
import { schedule } from 'node-cron';
import { HttpService } from '@nestjs/axios';
import * as yaml from 'js-yaml';
import { interval, take, lastValueFrom } from 'rxjs';


export class ConsulService<T> {
	public configs: any = Object.create({});
	private readonly consulURL: string;
	private readonly keys: IConsulKeys<T>[] | undefined;
	private readonly token: string;

	constructor({ connection, keys, updateCron }: IConsulConfig<T>, private readonly httpService: HttpService) {
		if (!connection) {
			throw new Error('consul connection null');
		}
		try {
			this.consulURL = `${connection.protocol}://${connection.host}:${connection.port}/v1/kv`;
			this.keys = keys;
			this.token = connection.token;
			this.planUpdate(updateCron);
		} catch (error) {
			throw new Error(`Consul init error ${(error as Error).message}`)
		}

	}

	async getKeyFromConsulDir(k: IConsulKeys) {
		const url = `${this.consulURL}${k.namespace}${String(k.key)}?recurse`;
		const { data } = await lastValueFrom(this.httpService
			.get<IConsulResponse[]>(url, {
				headers: {
					'X-Consul-Token': this.token,
				},
			}));
		const configs = [];
		for (const file of data) {
			if (file.Value) {
				configs.push(this.convertConfigFormat(file.Key, file.Value));
			}
		}
		const configName = String(k.alias || k.key);
		this.configs[configName] = configs;
	}
	private async getKeyFromConsul(k: IConsulKeys) {
		try {
			if (!k.key.toString().includes('.')) {
				return this.getKeyFromConsulDir(k);
			}
			const url = `${this.consulURL}${k.namespace}${String(k.key)}`;
			const { data } = await lastValueFrom(this.httpService
				.get<IConsulResponse[]>(url, {
					headers: {
						'X-Consul-Token': this.token,
					},
				}));
			return data;
		} catch (e) {
			const msg = `${this.consulURL}${k.namespace} Cannot find key ${JSON.stringify(k)}`;
			if (k.required) {
				throw new Error(msg)
			}
			Logger.error(msg);
			return null;
		}
	}
	private convertConfigFormat(keyName: string, value: any) {
		const result = value !== null ? Buffer.from(value, 'base64').toString() : value;
		if (keyName.includes('.json')) {
			return JSON.parse(result);
		} else if (keyName.includes('.yaml')) {
			return yaml.load(result);
		} else {
			return result;
		}
	}
	private updateConfig(value: any, key: IConsulKeys) {
		try {
			this.configs[String(key.alias || key.key)] = this.convertConfigFormat(String(key.key), value);
		} catch (e) {
			const msg = `Invalid JSON value in ${String(key.key)}`;

			if (key.required) {
				throw new Error(msg);
			}
			Logger.warn(msg);
		}
	}

	public async update(): Promise<void> {
		if (!this.keys) {
			return;
		}
		for (const k of this.keys) {
			const data = await this.getKeyFromConsul(k);
			if (data) {
				this.updateConfig(data[0].Value, k)
			}
		}
	}

	public async set<T>(key: string, value: T): Promise<boolean> {
		try {
			const { data } = await lastValueFrom(this.httpService
				.put<boolean>(`${this.consulURL}${key}`, value, {
					headers: {
						'X-Consul-Token': this.token,
					},
				}));
			return data;
		} catch (e) {
			Logger.error(e);
		}
		return false;
	}

	public async get<T>(key: string): Promise<T> {
		try {
			const { data } = await lastValueFrom(this.httpService
				.get<boolean>(`${this.consulURL}${key}`, {
					headers: {
						'X-Consul-Token': this.token,
					},
				}));
			if (Array.isArray(data)) {
				const result = Buffer.from(data[0].Value, 'base64').toString();
				return JSON.parse(result);
			} else {
				console.log(`get key ${key} type not array`);
			}

		} catch (e) {
			Logger.error(e);
		}
		return undefined as T;
	}

	public async delete(key: string): Promise<boolean> {
		try {
			const { data } = await lastValueFrom(this.httpService
				.delete<boolean>(`${this.consulURL}${key}`, {
					headers: {
						'X-Consul-Token': this.token,
					},
				}));
			return data;
		} catch (e) {
			Logger.error(e);
		}
		return false;
	}

	private planUpdate(updateCron: string | undefined) {
		if (updateCron) {
			schedule(updateCron, async () => {
				this.update()
			});
		}
	}
}
