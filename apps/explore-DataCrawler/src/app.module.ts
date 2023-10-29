import { Module } from '@nestjs/common';
import { RpcScanningModule } from './rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from './api-scanning/api-scanning.module';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq'
import { AlertModule } from '@orbiter-finance/alert';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { join } from 'path';
import { TransactionModule } from './transaction/transaction.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';

import { RpcCheckModule } from './rpc-check/rpc-check.module';

dayjs.extend(utc);

@Module({
  imports: [
    RpcCheckModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'DataCrawler',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-server/chains.json",
      envConfigPath: "explore-server/config.yaml",
    }),
    RedisModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (configService: ENVConfigService) => {
        if (configService.get('REDIS_URL')) {
          return {
            config: {
              url:configService.get('REDIS_URL')
            }
          }
        }
        return await configService.getAsync("REDIS");
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
    RabbitMqModule,
    RpcScanningModule,
    ApiScanningModule,
    ScheduleModule.forRoot(),
    TransactionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
