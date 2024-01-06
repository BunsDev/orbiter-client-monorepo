import { Module } from '@nestjs/common';

import { AppController } from './controllers/app.controller';
import { ProofService } from './services/proof.service';
import { ConsulModule } from '@orbiter-finance/consul';
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
            envConfigPath: "maker-open-api/config.yaml",
        }),
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
    providers: [AppService, ProofService, TransactionService],
})
export class AppModule {
    configure(consumer) {
        consumer
            .apply(GlobalMiddleware)
            .forRoutes('/');
    }
}
