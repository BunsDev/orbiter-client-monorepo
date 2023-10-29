import { Injectable } from '@nestjs/common';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";
import { RpcScanningFactory } from '../rpc-scanning/rpc-scanning.factory';
import { ChainConfigService } from '@orbiter-finance/config';
@Injectable()
export class RpcCheckService {
    constructor(
        @InjectMetric("rpc_lastBlock") public rpcLastBlock: Gauge<string>,
        @InjectMetric("rpc_scanBlock") public rpcScanBlock: Gauge<string>,
        @InjectMetric("rpc_scanBlockWait") public rpcScanBlockWait: Gauge<string>,
        private rpcScanningFactory: RpcScanningFactory,
        private chainConfig: ChainConfigService
    ) {
        // labelNames: ["network", "latestBlockNumber", "lastScannedBlockNumber", "processingCount", "waitBlockCount"]
        setInterval(this.task.bind(this), 1000 * 10);
        this.task();
    }
    async task() {
        const results = await this.getRpcStatus();
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
    async getStatusByService(chainId: string) {
        const factory = await this.rpcScanningFactory.services[chainId];
        if (!factory) {
            throw new Error(`${chainId} factory not found`)
        }
        const latestBlockNumber = factory.rpcLastBlockNumber;
        const lastScannedBlockNumber = await factory.dataProcessor.getNextScanMaxBlockNumber()
        return {
            chainId: factory.chainId,
            latestBlockNumber,
            lastScannedBlockNumber,
            behind: latestBlockNumber - lastScannedBlockNumber,
            processingCount: factory.dataProcessor.getProcessingCount(),
            waitBlockCount: factory.dataProcessor.getDataCount(),
            rate: factory.getRate(),
        };
    }
    async getRpcStatus() {
        const services = await this.rpcScanningFactory.services;
        const result = {
        }
        for (const chainId in services) {
            try {
                result[chainId] = await this.getStatusByService(chainId);
            } catch (error) {
                console.error(`${chainId} getRpcStatus error`, error);
            }
        }
        return result;
    }
}
