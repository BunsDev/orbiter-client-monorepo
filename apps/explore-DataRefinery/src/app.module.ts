import { Module } from '@nestjs/common';
import { TransactionModule } from './transaction/transaction.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { isEmpty } from '@orbiter-finance/utils';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq';
import { AlertModule } from '@orbiter-finance/alert';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { ScheduleModule } from '@nestjs/schedule';
import { BridgeTransaction, Transfers, DeployRecord, UserBalance } from "@orbiter-finance/seq-models";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'DataRefinery',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: process.env['ENV_CHAINS_CONFIG_PATH'] || "explore-server/chains.json",
      envConfigPath: process.env['ENV_VAR_PATH'] || "explore-server/config.yaml",
      makerV1RulePath: process.env['ENV_RULES_PATH'] || "rules",
      // cachePath: join(__dirname, 'runtime')
    }),
    RabbitMqModule,
    RedisModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async(configService: ENVConfigService) => {
        const REDIS_URL = await configService.getAsync("REDIS_URL");
        return {
          config: {
            url: REDIS_URL
          }
        }
      },
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return { ...config, autoLoadModels: false, models: [Transfers, BridgeTransaction, DeployRecord, UserBalance] };
      },
    }),
    AlertModule.registerAsync({
      inject:[ENVConfigService],
      useFactory:async(configService:ENVConfigService) => {
        const tgConfig = await configService.getAsync("TELEGRAM");
        return {
          telegram: tgConfig
        }
      }
    }),
    TransactionModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
