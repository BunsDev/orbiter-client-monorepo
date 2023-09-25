import { TransferModule } from "./transfer/transfer.module";
import { Module } from '@nestjs/common';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq'
import { isEmpty } from '@orbiter-finance/utils';
import { join } from "path";
import { WinstonModule, utilities } from 'nest-winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as winston from 'winston';
import { AlertModule } from '@orbiter-finance/alert'
import { TcpModule } from "@orbiter-finance/tcp";
import { logger } from '@orbiter-finance/utils'
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'Maker-Client',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-data-service/chains.json",
      envConfigPath: "explore-data-service/config.yaml",
      // makerV1RulePath: "explore-data-service/rules",
    }),
    WinstonModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const winstonHost = await envConfig.getAsync('WINSTON_HOST');
        const winstonPort = await envConfig.getAsync('WINSTON_PORT');
        const transports: any[] = [
          new DailyRotateFile({
            dirname: `logs`,
            filename: '%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: logger.loggerFormat(),
          }),
          new winston.transports.Console({
            format: logger.loggerFormat(),
            handleExceptions: true,
          }),
        ];
        if (winstonHost && winstonPort) {
          transports.push(new winston.transports.Http({ host: winstonHost, port: winstonPort }));
        }
        return {
          exitOnError: false,
          level: await envConfig.getAsync('LOG_LEVEL') || "info",
          transports: transports,
          exceptionHandlers: [
            new winston.transports.File({ filename: './logs/exception.log' }),
          ],
        };
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
  ],
  providers: [
  ],
  controllers: [],
})
export class AppModule { }
