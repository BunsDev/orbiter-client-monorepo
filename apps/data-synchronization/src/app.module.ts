import { Module } from '@nestjs/common';
import { AppController } from './app/app.controller';
import { AppService } from './app/app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { MakerTransaction, NetState, UserHistory } from '@orbiter-finance/v1-seq-models';
import { Transaction } from 'ethers6';
import { join, isEmpty } from 'lodash';
import { SequelizeModule } from "@nestjs/sequelize";

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
      chainConfigPath: "explore-open-api/chains.json",
      envConfigPath: "data-synchronization/config.yaml",
      makerV1RulePath: "rules",
      cachePath: join(__dirname,'runtime')
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
