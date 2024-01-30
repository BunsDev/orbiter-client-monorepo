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
import { TransactionModule } from './transaction/transaction.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { MetricModule } from './metric/metric.module';
import { AppController } from './app.controller'
import { ConsulModule } from '@orbiter-finance/nestjs-consul'
dayjs.extend(utc);

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
          keys: configService.get('CONSUL_KEYS1').split(','),
          updateCron: '* * * * *',
        } as any;
      },
    }),
    OrbiterConfigModule.forRoot(),
    RedisModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (configService: ENVConfigService) => {
        const REDIS_URL = await configService.getAsync("REDIS_URL");
        return {
          config: {
            url: REDIS_URL
          }
        }
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
    RabbitMqModule,
    ApiScanningModule,
    ScheduleModule.forRoot(),
    TransactionModule,
    MetricModule,
    RpcScanningModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
