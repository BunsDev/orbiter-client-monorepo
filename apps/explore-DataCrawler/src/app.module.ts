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
import { TransactionModule } from './transaction/transaction.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { MetricModule } from './metric/metric.module';
import {AppController} from './app.controller'
import { ConsulModule as ConsulModule2 } from 'nestjs-consul';

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
          name: 'DataCrawler',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: process.env['ENV_CHAINS_CONFIG_PATH'] || "explore-server/chains.json",
      envConfigPath: process.env['ENV_VAR_PATH'] || "explore-server/config.yaml",
    }),
    ConsulModule2.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => {
        const parsedUrl = new URL(configService.get("CONSUL_URL"));
        console.log(parsedUrl, '==parsedUrl')
				return {
					keys: [{ key: 'v1/explore-server/chains.json', alias: 'env' }, { key: 'prod/explore-server/chains.json', alias: 'chains' }],
					connection: {
						protocol: parsedUrl.protocol.replace(":",''),
						port: parsedUrl.port || 80,
						host: parsedUrl.hostname,
						token: parsedUrl.searchParams.get('token'),
					},
				} as any;
			},
		}),

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
      inject:[ENVConfigService],
      useFactory:async(configService:ENVConfigService) => {
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
