import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ConsulModule } from "@orbiter-finance/consul";
import { join } from "path";
import { SequelizeModule } from "@nestjs/sequelize";
import { isEmpty } from "@orbiter-finance/utils";
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { MakerTransaction, NetState, Transaction, UserHistory } from "@orbiter-finance/v1-seq-models";
import { ScheduleModule } from "@nestjs/schedule";

dayjs.extend(utc);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'explore-open-api',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: process.env['ENV_CHAINS_CONFIG_PATH'] || "explore-open-api/chains.json",
      envConfigPath: process.env['ENV_VAR_PATH'] || "explore-open-api/config.yaml",
      makerV1RulePath: process.env['ENV_RULES_PATH'] || "rules",
      cachePath: join(__dirname,'runtime')
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('V1_DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration V1_DATABASE_URL');
          process.exit(1);
        }
        return { ...config, autoLoadModels: false, models: [MakerTransaction, Transaction, NetState, UserHistory] };
      },
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return { ...config, autoLoadModels: false, models: [Transfers, BridgeTransaction] };
      },
    }),
    ApiModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
