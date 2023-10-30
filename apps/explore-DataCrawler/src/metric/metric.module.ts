import { Module } from '@nestjs/common';
import { makeGaugeProvider } from "@willsoto/nestjs-prometheus";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { RpcScanningModule } from '../rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from '../api-scanning/api-scanning.module';
import { MetricController } from './metric.controller';
@Module({
  imports: [
    RpcScanningModule,
    ApiScanningModule,
    PrometheusModule.register({
      controller: MetricController,
      customMetricPrefix: "crawler_",
      defaultMetrics: {
        enabled: false,
      },
    }),
  ],
  controllers: [],
  providers: [
    makeGaugeProvider({
      name: "rpc_lastBlock",
      help: "The current rpc has obtained the latest block on the chain",
      labelNames: ["network"]
    }),
    makeGaugeProvider({
      name: "rpc_scanBlock",
      help: "Which block number has the current program processed",
      labelNames: ["network"]
    }),
    makeGaugeProvider({
      name: "rpc_scanBlockWait",
      help: "Number of waiting blocks for processing",
      labelNames: ["network"]
    }),
  ]
})
export class MetricModule { }
