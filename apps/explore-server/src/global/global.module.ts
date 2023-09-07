import { Global, Module } from '@nestjs/common';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConfigModule as GlobalConfigModule } from '@orbiter-finance/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule, utilities } from 'nest-winston';
import * as winston from 'winston';
import { SequelizeModule } from '@nestjs/sequelize';
import { RabbitMqModule } from '../rabbit-mq/rabbit-mq.module';
import { ENVConfigService, ChainConfigService } from '@orbiter-finance/config';
import { KnexModule } from 'nest-knexjs';
import { isEmpty } from '@orbiter-finance/utils';
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GlobalConfigModule.forRoot({
      envConfigPath: "explore-data-service/config.yaml"
    }),
    ConsulModule.registerAsync({
      imports: [ConfigModule],
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
    WinstonModule.forRoot({
      exitOnError: false,
      level: 'debug',
      transports: [
        // new DailyRotateFile({
        //   filename: './logs/daily-%DATE%.log',
        //   datePattern: 'YYYY-MM-DD',
        //   maxFiles: '14d',
        // }),
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
    RabbitMqModule,
    ScheduleModule.forRoot(),
  ],
  providers: [ChainConfigService, ENVConfigService, ConfigService],
  exports: [ChainConfigService, ENVConfigService, ConfigService],
})
export class GlobalModule {}
