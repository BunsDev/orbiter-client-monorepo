import { Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { MakerTransaction, Transaction, NetState, UserHistory } from "@orbiter-finance/v1-seq-models";
import { V2Controller } from "./v2.controller";
import { V2Service } from "./v2.service";

@Module({
  imports: [
    SequelizeModule.forFeature(
      [MakerTransaction, Transaction, NetState, UserHistory]
    )
  ],
  controllers: [V2Controller],
  providers: [V2Service],
})
export class V2Module {
}

