import { Module } from '@nestjs/common';
import { makeGaugeProvider } from "@willsoto/nestjs-prometheus";
import {MetricController} from './metric.controller';
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import {MetricService} from './metric.service';
import {TransferModule} from '../transfer/transfer.module'
@Module({
  imports:[
    TransferModule,
    PrometheusModule.register({
      controller: MetricController,
      customMetricPrefix: "maker_client",
      defaultMetrics: {
        enabled: false,
      },
    }),
  ],
  providers: [
    MetricService,
    makeGaugeProvider({
      name: "pending_transfer",
      help: "Number of transactions awaiting payment",
      labelNames: ["network", "symbol"]
    }),
  ]
})
export class MetricModule {}
