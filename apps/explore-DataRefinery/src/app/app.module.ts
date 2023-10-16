import { Module } from '@nestjs/common';
import { TransactionModule } from './transaction/transaction.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { isEmpty } from '@orbiter-finance/utils';
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
      chainConfigPath: "explore-server/chains.json",
      envConfigPath: "explore-server/config.yaml",
      makerV1RulePath: "rules",
      // cachePath: join(__dirname, 'runtime')
    }),
    RabbitMqModule,
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
    AlertModule.registerAsync({
      inject:[ENVConfigService],
      useFactory:async(configService:ENVConfigService) => {
        const tgConfig = await configService.getAsync("TELEGRAM");
        return {
          telegram: tgConfig
        }
      }
    }),
    TransactionModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
