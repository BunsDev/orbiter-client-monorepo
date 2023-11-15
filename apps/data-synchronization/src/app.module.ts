import { Module } from '@nestjs/common';
import { AppController } from './app/app.controller';
import { AppService } from './app/app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { MakerTransaction, Transaction, NetState, UserHistory } from '@orbiter-finance/v1-seq-models';
import { join, isEmpty } from 'lodash';
import { SequelizeModule } from "@nestjs/sequelize";
import { TransactionService } from './app/transaction.service';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { RabbitMqModule } from '@orbiter-finance/rabbit-mq'
import { AlertModule } from '@orbiter-finance/alert'
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
          name: 'data-synchronization',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-server/chains.json",
      envConfigPath: "dataSync/config.yaml",
      makerV1RulePath: "rules",
      cachePath: join(__dirname,'runtime')
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
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      name: 'v1',
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
      name: 'v3',
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return { ...config, autoLoadModels: false, models: [Transfers, BridgeTransaction] };
      },
    }),
    SequelizeModule.forFeature([MakerTransaction, Transaction], 'v1'),
    SequelizeModule.forFeature([Transfers, BridgeTransaction], 'v3'),
    ScheduleModule.forRoot()
  ],
  controllers: [AppController],
  providers: [AppService, TransactionService],
})
export class AppModule {}
