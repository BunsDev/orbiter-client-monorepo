import { Module } from '@nestjs/common';

import { AppController } from './controllers/app.controller';
import { ProofService } from './services/proof.service';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProofController } from './controllers/proof.controller'
import { TransactionController } from './controllers/transaction.controller'
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { TransactionService } from './services/transaction.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'maker-openapi',
          url: config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-server/chains.json",
      envConfigPath: "explore-server/config.yaml",
    }),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
        if (!config) {
          console.error('Missing configuration DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    }),
    SequelizeModule.forFeature([Transfers, BridgeTransaction])
  ],
  controllers: [AppController, ProofController, TransactionController],
  providers: [ProofService, TransactionService],
})
export class AppModule { }
