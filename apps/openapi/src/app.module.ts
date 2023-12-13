import { Module } from '@nestjs/common';

import { BridgeModule } from './modules/bridge/bridge.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { join } from 'lodash';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { DealerModule } from './modules/dealer/dealer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'openapi',
          url: config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: process.env['ENV_CHAINS_CONFIG_PATH'] || "explore-server/chains.json",
      envConfigPath: process.env['ENV_VAR_PATH'] || "openapi/config.yaml",
      makerV1RulePath: process.env['ENV_RULES_PATH'] || "rules",
      // cachePath: join(__dirname, 'runtime')
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (!config) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      name:"stats",
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (!config) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        config.schema = 'stats';
        return config;
      },
    }),
    
    BridgeModule, DealerModule],

  controllers: [],
  providers: [],
})
export class AppModule { }
