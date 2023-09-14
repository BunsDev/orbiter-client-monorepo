import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { OrbiterConfigModule } from '@orbiter-finance/config';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ConsulModule } from "@orbiter-finance/consul";
import { join } from "path";

dayjs.extend(utc);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'explore-open-api',
          host: config.get('CONSUL_HOST'),
          port: config.get('CONSUL_PORT'),
          defaults: {
            token: config.get('CONSUL_TOKEN'),
          },
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-open-api/chains.json",
      envConfigPath: "explore-open-api/config.yaml",
      tradingPairsPath: "common/trading-pairs",
      cachePath: join(__dirname,'runtime')
    }),
    // SequelizeModule.forRootAsync({
    //   inject: [ENVConfigService],
    //   useFactory: async (envConfig: ENVConfigService) => {
    //     const config: any = await envConfig.getAsync('V1_DATABASE_URL');
    //     if (isEmpty(config)) {
    //       console.error('Missing configuration V1_DATABASE_URL');
    //       process.exit(1);
    //     }
    //     return config;
    //   },
    // }),
    // SequelizeModule.forRootAsync({
    //   inject: [ENVConfigService],
    //   useFactory: async (envConfig: ENVConfigService) => {
    //     const config: any = await envConfig.getAsync('DATABASE_URL');
    //     if (isEmpty(config)) {
    //       console.error('Missing configuration DATABASE_URL');
    //       process.exit(1);
    //     }
    //     return config;
    //   },
    // }),
    ApiModule,
    // ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
