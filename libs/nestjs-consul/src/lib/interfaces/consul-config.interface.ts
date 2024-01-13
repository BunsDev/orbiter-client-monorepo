import { IConsulConnection } from './consul-connection.interface';
import { ModuleMetadata, Type } from '@nestjs/common';

export interface IConsulConfig<T = any> {
	url?:string;
	keys?: IConsulKeys<T>[];
	updateCron?: string;
	connection?: IConsulConnection;
}

export interface IConsulConfigURL<T = any> {
	keys?: IConsulKeys<T>[];
	updateCron?: string;
}

export interface IConsulAsyncConfig<T = any> extends Pick<ModuleMetadata, 'imports'> {
		useFactory?: (...args: any[]) => Promise<IConsulConfig<T>> | IConsulConfig<T> ;
		inject?: any[];
}

export interface IConsulKeys<T = any> {
	key: keyof T;
	namespace?:string;
	alias?:string;
	required?: boolean;
}