import { Module, DynamicModule } from '@nestjs/common';
import { ChainConfigService } from './chain-config.service';
import { ENVConfigService } from './env-config.service';

import {ORBITER_CONFIG_MODULE_OPTS} from './config.constants';
import {ConfigModuleOptions} from './config.interface';
import {MakerV1RuleService} from './maker-v1-rule.service'
@Module({})
export class OrbiterConfigModule {
	static forRoot(options: ConfigModuleOptions = {}): DynamicModule {
		return {
			module: OrbiterConfigModule,
			global:true,
			providers: [
				ChainConfigService,
				ENVConfigService,
				MakerV1RuleService,
				{
					provide: ORBITER_CONFIG_MODULE_OPTS,
					useValue: options,
				},
			],
			exports: [ChainConfigService, ENVConfigService, MakerV1RuleService],
		};
	}
}
