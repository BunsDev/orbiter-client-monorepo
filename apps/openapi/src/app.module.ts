import { Module } from '@nestjs/common';

import { BridgeModule } from './modules/bridge/bridge.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ENVConfigService, OrbiterConfigModule } from '@orbiter-finance/config';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { DealerModule } from './modules/dealer/dealer.module';
import { ConsulModule } from '@orbiter-finance/nestjs-consul';
import { Transfers, BridgeTransaction, RefundRecord } from '@orbiter-finance/seq-models';
import TransactionSource from './models/TransactionSource.model';

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
          keys: configService.get('OPENAPI_CONSUL_KEYS').split(','),
          updateCron: '* * * * *',
        } as any;
      },
    }),
    OrbiterConfigModule.forRoot(),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      name: 'bridge',
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (!config) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        config.schema = 'public';
        return {...config,schema: 'public',models:[Transfers,BridgeTransaction,RefundRecord]};
      },
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      name:"stats",
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_STATS_URL');
        if (!config) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return {...config,schema: 'stats', models:[TransactionSource]};
      },
    }),
    
    BridgeModule, DealerModule],

  controllers: [],
  providers: [],
})
export class AppModule { }
