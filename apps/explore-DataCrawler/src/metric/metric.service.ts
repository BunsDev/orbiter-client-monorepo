import { Injectable } from '@nestjs/common';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";
import { RpcScanningFactory } from '../rpc-scanning/rpc-scanning.factory';
import { ChainConfigService } from '@orbiter-finance/config';
@Injectable()
export class MetricService {
    constructor(
        @InjectMetric("rpc_lastBlock") public rpcLastBlock: Gauge<string>,
        @InjectMetric("rpc_scanBlock") public rpcScanBlock: Gauge<string>,
        @InjectMetric("rpc_scanBlockWait") public rpcScanBlockWait: Gauge<string>,
        private rpcScanningFactory: RpcScanningFactory,
        private chainConfig: ChainConfigService
    ) {
        setInterval(this.task.bind(this), 1000 * 5);
    }
    async task() {
        const results = await this.rpcScanningFactory.getRpcStatus();
        for (const chainId in results) {
            const data = results[chainId];
            if (data) {
                const chain = await this.chainConfig.getChainInfo(chainId);
                // last block
                this.rpcLastBlock.labels({
                    "network": chain.name,
                }).set(data.latestBlockNumber);
                // 
                this.rpcScanBlock.labels({
                    "network": chain.name,
                }).set(data.lastScannedBlockNumber);
                this.rpcScanBlockWait.labels({
                    "network": chain.name,
                }).set(data.waitBlockCount + data.behind);
            }
        }
    }

}
