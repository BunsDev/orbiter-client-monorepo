import { Module } from '@nestjs/common';
import { makeGaugeProvider } from "@willsoto/nestjs-prometheus";
import { MetricController } from './metric.controller';
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { MetricService } from './metric.service';
import { TransferModule } from '../transfer/transfer.module'
import { AccountFactoryService } from '../factory'

@Module({
  imports: [
    TransferModule,
    PrometheusModule.register({
      defaultMetrics: {
        enabled: false,
      },
    }),
  ],
  controllers: [MetricController],
  providers: [
    AccountFactoryService,
    MetricService,
    makeGaugeProvider({
      name: "pending_transfer",
      help: "Number of transactions awaiting payment",
      labelNames: ["targetChain", "targetMaker", 'targetChainName']
    }),
    makeGaugeProvider({
      name: "last_transfer",
      help: "Last Transfer Time",
      labelNames: ["targetChain", "targetMaker", 'targetChainName']
    }),
    makeGaugeProvider({
      name: "tranfer_lock",
      help: "Last Transfer Time",
      labelNames: ["targetChain", "targetMaker", 'targetChainName']
    }),
  ]
})
export class MetricModule { }
