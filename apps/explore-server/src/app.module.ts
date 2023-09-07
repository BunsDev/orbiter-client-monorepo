import { Module } from '@nestjs/common';
import { RpcScanningModule } from './rpc-scanning/rpc-scanning.module';
import { ApiModule } from './api/api.module';
import { ThegraphModule } from './thegraph/thegraph.module';
import { TransactionModule } from './transaction/transaction.module';

import { WinstonModule, utilities } from 'nest-winston';
import { ApiScanningModule } from './api-scanning/api-scanning.module';
import * as winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { RabbitMqModule } from './rabbit-mq/rabbit-mq.module';
import { AlertModule } from '@orbiter-finance/alert';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService,ChainConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { join } from 'path';
import { KnexModule } from 'nest-knexjs';
import { isEmpty } from '@orbiter-finance/utils';
import DailyRotateFile from 'winston-daily-rotate-file';

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
          format: winston.format.combine(
            winston.format.timestamp({
            	format: 'YYYY-MM-DD HH:mm:ss',
            }),
            winston.format.json(),
          ),
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            utilities.format.nestLike('BlockExploreData', {
              colors: true,
              prettyPrint: true,
            }),
          ),
          handleExceptions: true,
        }),
      ],
      exceptionHandlers: [
        new winston.transports.File({ filename: './logs/exception.log' }),
      ],
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    }),
    KnexModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('DATABASE_THEGRAPH');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_THEGRAPH');
          process.exit(1);
        }
        return { config };
      },
    }),
    AlertModule,
    ThegraphModule,
    RabbitMqModule,
    TransactionModule,
    RpcScanningModule,
    ApiScanningModule,
    ApiModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
