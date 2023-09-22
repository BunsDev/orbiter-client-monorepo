import { Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { MakerTransaction, Transaction, NetState, UserHistory } from "@orbiter-finance/v1-seq-models";
import { V3Controller } from "./v3.controller";
import { V2Service } from "../v2/v2.service";
import { V3Service } from "./v3.service";

@Module({
  imports: [
    SequelizeModule.forFeature(
      [Transfers, BridgeTransaction, MakerTransaction, Transaction, NetState, UserHistory]
    )
  ],
  controllers: [V3Controller],
  providers: [V2Service, V3Service],
})
export class V3Module {
}

