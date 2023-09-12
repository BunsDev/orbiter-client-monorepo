import { Module, DynamicModule } from '@nestjs/common';
import { ChainConfigService } from './chain-config.service';
import { ENVConfigService } from './env-config.service';

import {ORBITER_CONFIG_MODULE_OPTS} from './config.constants';
import {ConfigModuleOptions} from './config.interface';
import { V1MakerConfigService } from "./v1-maker-config.service";

@Module({})
export class OrbiterConfigModule {
	static forRoot(options: ConfigModuleOptions): DynamicModule {
		return {
			module: OrbiterConfigModule,
			global:true,
			providers: [
				ChainConfigService,
				ENVConfigService,
        V1MakerConfigService,
				{
					provide: ORBITER_CONFIG_MODULE_OPTS,
					useValue: options,
				},
			],
			exports: [ChainConfigService, ENVConfigService, V1MakerConfigService],
		};
	}
}
