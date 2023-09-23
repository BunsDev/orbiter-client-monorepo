import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TransactionModule } from './transaction/transaction.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { loggerFormat } from 'libs/utils/src/lib/logger';
import { WinstonModule } from 'nest-winston';
import { isEmpty } from '@orbiter-finance/utils';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq';
import { AlertModule } from '@orbiter-finance/alert';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { ScheduleModule } from '@nestjs/schedule';

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
      chainConfigPath: "explore-data-service/chains.json",
      envConfigPath: "explore-data-service/config.yaml",
      makerV1RulePath: "explore-data-service/rules",
      // cachePath: join(__dirname, 'runtime')
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
          format: loggerFormat(),
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
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    }),
    AlertModule,
    RabbitMqModule,
    TransactionModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule { }
