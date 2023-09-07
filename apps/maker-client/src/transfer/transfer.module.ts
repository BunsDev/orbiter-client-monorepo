import { Module } from "@nestjs/common";
import { ValidatorService } from "./validator/validator.service";
import { SequencerService } from "./sequencer/sequencer.service";
import { AccountFactoryService } from "../account/factory";
import { Transfers, BridgeTransaction } from "@orbiter-finance/seq-models";
import { SequelizeModule } from "@nestjs/sequelize";
import { SequencerScheduleService } from "./sequencer/sequencer.schedule";
import { ConfigModule as GlobalConfigModule } from '@orbiter-finance/config';
import { ChainLinkService } from '../service/chainlink.service'
@Module({
  imports: [
    GlobalConfigModule,
    SequelizeModule.forFeature([Transfers, BridgeTransaction]),
  ],
  providers: [
    ChainLinkService,
    SequencerScheduleService,
    SequencerService,
    ValidatorService,
    AccountFactoryService,
  ],
})
export class TransferModule { }
