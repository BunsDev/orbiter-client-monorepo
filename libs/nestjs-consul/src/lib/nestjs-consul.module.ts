import { HttpModule, HttpService } from '@nestjs/axios';
import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { ConsulService } from './consul.service';
import { IConsulConfig, IConsulAsyncConfig } from './interfaces/consul-config.interface';

@Global()
@Module({})
export class ConsulModule {
	static forRoot<T>(config: IConsulConfig<T>): DynamicModule {
		const consulServiceProvider: Provider = {
			provide: ConsulService,
			useFactory: async () => {
				const consulService = new ConsulService<T>(config, new HttpService());
				if (config.keys) {
					await consulService.update();
				}
				return consulService;
			},
		};
		return {
			module: ConsulModule,
			providers: [consulServiceProvider],
			exports: [consulServiceProvider],
			imports: [HttpModule]
		};
	}

	static forRootAsync<T>(options: IConsulAsyncConfig<T>): DynamicModule {
		const consulServiceProvider = this.createAsyncOptionsProvider<T>(options);
		return {
			module: ConsulModule,
			imports: options.imports,
			providers: [consulServiceProvider],
			exports: [consulServiceProvider]
		};
	}
	private static formatConfig(config: IConsulConfig) {
		if (config.url) {
			const parsedUrl = new URL(config.url);
			const keys = config.keys.map((value) => {
				let keyName = String(typeof value === 'string' ? value : value.key);
				let alias = '';
				if (keyName.includes('.')) {
					const fileSplit = keyName.split('/');
					alias = fileSplit[fileSplit.length - 1].split('.')[0];
				} else {
					alias = keyName;
				}
				if (typeof value != 'string') {
					return {
						...value,
						key: keyName,
						alias,
						namespace: parsedUrl.pathname != '/' ? parsedUrl.pathname : '',
					}
				} else {
					return {
						alias,
						key: keyName,
						namespace: parsedUrl.pathname != '/' ? parsedUrl.pathname : '',
					}
				}
			})
			config.keys = keys;
			const connection = {
				protocol: parsedUrl.protocol.replace(":", ''),
				port: parsedUrl.port || 80,
				host: parsedUrl.hostname,
				token: parsedUrl.searchParams.get('token'),
			}
			config.connection = connection as any;
		}
		return config;
	}
	private static createAsyncOptionsProvider<T>(
		options: IConsulAsyncConfig<T>,
	): Provider {
		return {
			provide: ConsulService,
			useFactory: async (...args: any[]) => {
				if (options.useFactory) {
					const config = await options.useFactory(...args);
					this.formatConfig(config);
					const consulService = new ConsulService<T>(config, new HttpService());
					if (config.keys) {
						await consulService.update();
					}
					return consulService;
				} else {
					throw new Error('useFactory not found');
				}

			},
			inject: options.inject || [],
		};

	}
}