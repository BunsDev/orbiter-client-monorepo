import { SequelizeModule } from '@nestjs/sequelize';
import { Module } from '@nestjs/common';
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { ProceedsModule } from './proceeds/proceeds.module';
import { TransactionModule } from './transaction/transaction.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import configuration from './config/configuration';
import {ScheduleModule} from '@nestjs/schedule'
import utc from 'dayjs/plugin/utc';
// import dayjs from 'dayjs';
// dayjs.extend(utc);
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load:[configuration]
    }),    
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return { ...config.get("DATABASE_URL"), autoLoadModels: false, models: [Transfers, BridgeTransaction],logging: true};
      },
    }),
    ProceedsModule, TransactionModule, ExchangeRateModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
