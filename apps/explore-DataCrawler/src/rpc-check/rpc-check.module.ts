import { Module } from '@nestjs/common';
import { RpcCheckService } from './rpc-check.service';
import { makeGaugeProvider } from "@willsoto/nestjs-prometheus";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { PrometheusController } from './prometheus.controller';
import { RpcScanningModule } from '../rpc-scanning/rpc-scanning.module';
import { ApiScanningModule } from '../api-scanning/api-scanning.module';
import { ScanningController } from './scanning.controller';
@Module({
  imports:[
    RpcScanningModule, ApiScanningModule,
    PrometheusModule.register({
      controller: PrometheusController,
      customMetricPrefix: "explore_crawler",
      defaultMetrics: {
        enabled: false,
        config: {
          prefix: 'crawler_'
        }
      },
    }),
  ],
  controllers:[ScanningController],
  providers: [RpcCheckService,
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
export class RpcCheckModule {}
