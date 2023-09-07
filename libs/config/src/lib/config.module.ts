import { Module, Global, DynamicModule } from '@nestjs/common';
import { ChainConfigService } from './chain-config.service';
import { ENVConfigService } from './env-config.service';

import {ORBITER_CONFIG_MODULE_OPTS} from './config.constants';
import {ConfigModuleOptions} from './config.interface';

@Global()
@Module({
	controllers: [],
	providers: [ChainConfigService, ENVConfigService],
	exports: [ChainConfigService, ENVConfigService],
})
export class OrbiterConfigModule {
	static forRoot(options: ConfigModuleOptions): DynamicModule {
		return {
			module: OrbiterConfigModule,
			providers: [
				ENVConfigService,
				ChainConfigService,
				{
					provide: ORBITER_CONFIG_MODULE_OPTS,
					useValue: options,
				},
			],
			exports: [ChainConfigService, ENVConfigService],
		};
	}
}
