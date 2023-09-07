import { Module, DynamicModule } from '@nestjs/common';
import { ChainConfigService } from './chain-config.service';
import { ENVConfigService } from './env-config.service';

import {ORBITER_CONFIG_MODULE_OPTS} from './config.constants';
import {ConfigModuleOptions} from './config.interface';

@Module({})
export class OrbiterConfigModule {
	static forRoot(options: ConfigModuleOptions): DynamicModule {
		return {
			module: OrbiterConfigModule,
			global:true,
			providers: [
				ChainConfigService,
				ENVConfigService,
				{
					provide: ORBITER_CONFIG_MODULE_OPTS,
					useValue: options,
				},
			],
			exports: [ChainConfigService, ENVConfigService],
		};
	}
}
