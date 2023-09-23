import { TransferModule } from "./transfer/transfer.module";
import { Global, Module } from '@nestjs/common';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService} from '@orbiter-finance/config';
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
                    name: 'MakerClient',
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
                utilities.format.nestLike('makerClient', {
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
        AlertModule.registerAsync({
          inject:[ENVConfigService],
          useFactory:async(configService:ENVConfigService) => {
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
