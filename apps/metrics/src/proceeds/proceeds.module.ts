import { Module, Inject } from '@nestjs/common';
import { ProceedsService } from './proceeds.service';
import { ProceedsController } from './proceeds.controller';
import { PrometheusModule, makeGaugeProvider } from "@willsoto/nestjs-prometheus";
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { SequelizeModule } from '@nestjs/sequelize';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
@Module({
  imports: [
    ExchangeRateModule,
    SequelizeModule.forFeature([Transfers, BridgeTransaction]),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: false,
      },
    }),
  ],
  providers: [ProceedsService, 
    makeGaugeProvider({
      name: "orbiterProceeds",
      help: "orbiterProceeds_help",
      labelNames: ["network", "currency"]
    }),],
  controllers: [ProceedsController]
})
export class ProceedsModule {}
