import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { join } from "path";
import { SequelizeModule } from "@nestjs/sequelize";
import { isEmpty } from "@orbiter-finance/utils";
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { MakerTransaction, NetState, Transaction, UserHistory } from "@orbiter-finance/v1-seq-models";
import { ScheduleModule } from "@nestjs/schedule";
import { ConsulModule } from '@client-monorepo/nestjs-consul';

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
          keys: configService.get('CONSUL_KEYS').split(','),
          updateCron: '* * * * *',
        } as any;
      },
    }),
    OrbiterConfigModule.forRoot(),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('V1_DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration V1_DATABASE_URL');
          process.exit(1);
        }
        return { ...config, autoLoadModels: false, models: [MakerTransaction, Transaction, NetState, UserHistory] };
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
        return { ...config, autoLoadModels: false, models: [Transfers, BridgeTransaction] };
      },
    }),
    ApiModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
