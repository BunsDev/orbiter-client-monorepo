import { ModuleMetadata } from '@nestjs/common/interfaces';

export interface ConsulOptions {
  name?: string;
  host?: string;
  port?: string;
  nameSpace?:string;
  defaults?: any;
  url?:string;
}

export interface ConsulModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: any[]) => ConsulOptions | Promise<ConsulOptions>;
  inject?: any[];
}
