import { Module } from '@nestjs/common';

import { BridgeModule } from './bridge/bridge.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { join } from 'lodash';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';

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
      chainConfigPath: "explore-open-api/chains.json",
      envConfigPath: "explore-open-api/config.yaml",
      makerV1RulePath: "rules",
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
    }),BridgeModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
