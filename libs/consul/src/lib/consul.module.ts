import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { ConsulService } from './consul.service';
import { CONSUL_OPTIONS } from './consul.constants';
import { ConsulOptions, ConsulModuleAsyncOptions } from './consul.interface';
@Module({})
export class ConsulModule {
  static registerAsync(options: ConsulModuleAsyncOptions ): DynamicModule {

    const provider = this.createAsyncOptionsProvider(options);
    return {
      module: ConsulModule,
      global:true,
      imports: options.imports,
      providers: [provider],
      exports: [provider],
    };
  }
  static register(options: ConsulOptions): DynamicModule {
    return {
      module: ConsulModule,
      global:true,
      providers: [
        {
          provide: CONSUL_OPTIONS,
          useValue: options,
        },
        ConsulService,
      ],
      exports: [ConsulService],
    };
  }
  private static createAsyncOptionsProvider<T>(
    options: ConsulModuleAsyncOptions,
  ): Provider {
    return {
      provide: ConsulService,
      useFactory: async (...args: any[]) => {
        const config = await options.useFactory(...args);
        if (config.url) {
          const parsedUrl = new URL(config.url);
          config.host= parsedUrl.hostname;
          config.port = parsedUrl.port || '80';
          config.defaults = {
            token:parsedUrl.searchParams.get('token')
          };
        }

        return new ConsulService(config);
      },
      inject: options.inject || [],
    };
  }
}
