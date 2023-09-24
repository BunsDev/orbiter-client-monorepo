import { Module, Global, DynamicModule, Provider } from '@nestjs/common';
import { AlertService } from './alert.service';
import { ModuleMetadata } from '@nestjs/common/interfaces';
export interface TelegramOpts {
  chatId: string;
  token: string
}
export interface SMSOpts {
  host: string;
  uid:string;
  token: string
  phoneNumbers:string[]
}
export interface AlertModuleOpts {
  telegram?: TelegramOpts,
  sms?: SMSOpts
}
export interface AlertModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: any[]) => AlertModuleOpts | Promise<AlertModuleOpts>;
  inject?: any[];
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {
  static registerAsync(options: AlertModuleAsyncOptions): DynamicModule {
    return {
      module: AlertModule,
      providers: [
        AlertService,
        ...this.createAlertProviders(options)
      ],
      exports: [AlertService],
    };
  }
  static createAlertProviders(options: AlertModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: 'AlertModuleOpts',
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ]
    }
    return []
  }
  static register(opts: AlertModuleOpts): DynamicModule {
    console.log('Parameter passed to module:', opts);
    return {
      module: AlertModule,
      providers: [
        {
          provide: 'AlertModuleOpts',
          useValue: opts,
        },
        AlertService,
      ],
      exports: [AlertService],
    };
  }
}
