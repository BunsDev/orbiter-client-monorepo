import { Module } from "@nestjs/common";
import { ValidatorService } from "./validator/validator.service";
import { AccountFactoryService } from "../factory";
import { Transfers, BridgeTransaction } from "@orbiter-finance/seq-models";
import { SequelizeModule } from "@nestjs/sequelize";
import { SequencerScheduleService } from "./sequencer/sequencer.schedule";
import { ChainLinkService } from '../service/chainlink.service'
import { PrivateKeyService } from "../service/privatekey.service";
@Module({
  imports: [
    SequelizeModule.forFeature([Transfers, BridgeTransaction]),
  ],
  providers: [
    PrivateKeyService,
    ChainLinkService,
    SequencerScheduleService,
    ValidatorService,
    AccountFactoryService,
  ],
  exports: [
    ValidatorService,
    SequencerScheduleService
  ]
})
export class TransferModule { }
