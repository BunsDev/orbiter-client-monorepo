import { TransferModule } from "./transfer/transfer.module";
import { Global, Module } from '@nestjs/common';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrbiterConfigModule, ENVConfigService} from '@orbiter-finance/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { isEmpty } from '@orbiter-finance/utils';
import { join } from "path";
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        ConsulModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                return {
                    name: 'BlockExploreData',
                    host: config.get('CONSUL_HOST'),
                    port: config.get('CONSUL_PORT'),
                    defaults: {
                        token: config.get('CONSUL_TOKEN'),
                    },
                };
            },
        }),
        OrbiterConfigModule.forRoot({
            chainConfigPath:"explore-data-service/chains.yaml",
            envConfigPath: "explore-data-service/config.yaml",
            cachePath: join(__dirname,'runtime')
        }),
        SequelizeModule.forRootAsync({
            inject: [ENVConfigService],
            useFactory: async (envConfig: ENVConfigService) => {
                const config: any = await envConfig.getAsync('DATABASE_URL');
                if (isEmpty(config)) {
                    console.error('Missing configuration DATABASE_URL');
                    process.exit(1);
                }
                return config;
            },
        }),
        TransferModule,
        ScheduleModule.forRoot(),
    ],
    providers: [
    ],
    controllers: [],
})
export class AppModule { }