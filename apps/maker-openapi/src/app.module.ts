import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { ProofService } from './services/proof.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProofController } from './controllers/proof.controller';
import { TransactionController } from './controllers/transaction.controller';
import { SequelizeModule, SequelizeModuleOptions } from '@nestjs/sequelize';
import { OrbiterConfigModule, ENVConfigService } from '@orbiter-finance/config';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import {
    ArbitrationProof,
    ArbitrationMakerTransaction, ArbitrationRecord
} from '@orbiter-finance/maker-api-seq-models';
import { TransactionService } from './services/transaction.service';
import { isEmpty } from "../../../libs/utils/src";
import { AppService } from "./services/app.service";
import { GlobalMiddleware } from "./middleware/globalMiddleware";
import { HttpExceptionFilter } from "./middleware/httpExceptionFilter";
import { APP_FILTER } from "@nestjs/core";
import { ConsulModule } from '@orbiter-finance/nestjs-consul';

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
                  url: configService.get("CONSUL_URL"),
                  keys: configService.get('CONSUL_KEYS_MAKER_API').split(','),
                  updateCron: '* * * * *',
              } as any;
            },
          }),
          OrbiterConfigModule.forRoot(),
        SequelizeModule.forRootAsync({
            inject: [ENVConfigService],
            useFactory: async (envConfig: ENVConfigService) => {
                const config: any = await envConfig.getAsync('MAKER_API_DATABASE_URL');
                if (isEmpty(config)) {
                    console.error('Missing configuration MAKER_API_DATABASE_URL');
                    process.exit(1);
                }
                return { ...config, autoLoadModels: false, models: [ArbitrationProof, ArbitrationMakerTransaction, ArbitrationRecord] };
            },
        }),
        SequelizeModule.forRootAsync({
            inject: [ENVConfigService],
            useFactory: async (envConfig: ENVConfigService) => {
                const config: SequelizeModuleOptions = await envConfig.getAsync('DATABASE_URL');
                if (!config) {
                    console.error('Missing configuration DATABASE_URL');
                    process.exit(1);
                }
                return { ...config, autoLoadModels: false, models: [Transfers, BridgeTransaction] };
            },
        }),
        SequelizeModule.forFeature([Transfers, BridgeTransaction, ArbitrationProof, ArbitrationMakerTransaction, ArbitrationRecord])
    ],
    controllers: [AppController, ProofController, TransactionController],
    providers: [AppService, ProofService, TransactionService, {
        provide: APP_FILTER,
        useClass: HttpExceptionFilter,
    }],
})
export class AppModule {
    configure(consumer) {
        consumer
            .apply(GlobalMiddleware)
            .forRoutes('/');
    }
}
