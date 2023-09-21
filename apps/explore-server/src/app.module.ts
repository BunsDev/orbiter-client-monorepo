import { Module } from '@nestjs/common';
import { RpcScanningModule } from './rpc-scanning/rpc-scanning.module';
import { ApiModule } from './api/api.module';
import { WinstonModule } from 'nest-winston';
import { ApiScanningModule } from './api-scanning/api-scanning.module';
import * as winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq'
import { AlertModule } from '@orbiter-finance/alert';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ENVConfigService, OrbiterConfigModule} from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { join } from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import {loggerFormat} from './utils/logger'
import { TransactionModule } from './transaction/transaction.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';
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
          name: 'BlockExploreData',
          host: config.get('CONSUL_HOST'),
          port: config.get('CONSUL_PORT'),
          defaults: {
            token: config.get('CONSUL_TOKEN'),
          },
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath:"explore-data-service/chains.json",
      envConfigPath: "explore-data-service/config.yaml",
      makerV1RulePath: "explore-data-service/rules",
      cachePath: join(__dirname,'runtime')
    }),
    WinstonModule.forRoot({
      exitOnError: false,
      level: 'debug',
      transports: [
        new DailyRotateFile({
          dirname: `logs`,
          filename: '%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: loggerFormat(),
        }),
        new winston.transports.Console({
          format:loggerFormat(),
          handleExceptions: true,
        }),
      ],
      exceptionHandlers: [
        new winston.transports.File({ filename: './logs/exception.log' }),
      ],
    }),
    RedisModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async(configService: ENVConfigService) => {
        return await configService.getAsync("REDIS");
      },
    }),
    AlertModule,
    RabbitMqModule,
    RpcScanningModule,
    ApiScanningModule,
    ApiModule,
    ScheduleModule.forRoot(),
    TransactionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
