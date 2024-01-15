import { RedisModule } from '@liaoliaots/nestjs-redis';
import { TransferModule } from "./transfer/transfer.module";
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq'
import { isEmpty } from '@orbiter-finance/utils';
import { AlertModule } from '@orbiter-finance/alert'
import { TcpModule } from "@orbiter-finance/tcp";
import { MetricModule } from './metric/metric.module'
import { ConsulModule } from '@client-monorepo/nestjs-consul';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return {
          url:configService.get("CONSUL_URL"),
          keys: configService.get('CONSUL_KEYS').split(','),
          updateCron: '* * * * *',
        } as any;
      },
    }),
    OrbiterConfigModule.forRoot(),
    OrbiterConfigModule.forRoot({
      chainConfigPath: process.env['ENV_CHAINS_CONFIG_PATH'] || "maker-client/chains.json",
      envConfigPath: process.env['ENV_VAR_PATH'] || "maker-client/config.yaml",
    }),
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
        console.log(await envConfig.getAsync('DisabledSourceAddress'), '===', process.env['ENV_VAR_PATH'])
        const config: any = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    }),
    AlertModule.registerAsync({
      inject: [ENVConfigService],
      useFactory: async (configService: ENVConfigService) => {
        const tgConfig = await configService.getAsync("TELEGRAM");
        return {
          telegram: tgConfig
        }
      }
    }),
    TransferModule,
    RabbitMqModule,
    TcpModule,
    ScheduleModule.forRoot(),
    MetricModule,
  ],
  providers: [
  ],
  controllers: [],
})
export class AppModule { }
