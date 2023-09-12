import { Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { MakerTransaction, Transaction, NetState, UserHistory } from "@orbiter-finance/v1-seq-models";
import { ENVConfigService } from "@orbiter-finance/config";
import { isEmpty } from "@orbiter-finance/utils";
import { V2Controller } from "./v2.controller";
import { V2Service } from "./v2.service";

@Module({
  imports: [
    SequelizeModule.forFeature(
      [MakerTransaction, Transaction, NetState, UserHistory]
    ),
    SequelizeModule.forRootAsync({
      inject: [ENVConfigService],
      useFactory: async (envConfig: ENVConfigService) => {
        const config: any = await envConfig.getAsync('V1_DATABASE_URL');
        if (isEmpty(config)) {
          console.error('Missing configuration V1_DATABASE_URL');
          process.exit(1);
        }
        return config;
      },
    })
  ],
  controllers: [V2Controller],
  providers: [V2Service],
})
export class V2Module {
}

