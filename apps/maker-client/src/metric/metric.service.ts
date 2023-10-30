import { Injectable } from '@nestjs/common';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";
import { ChainConfigService } from '@orbiter-finance/config';
import { SequencerScheduleService } from '../transfer/sequencer/sequencer.schedule'
@Injectable()
export class MetricService {
    constructor(
        @InjectMetric("pending_transfer") public pendingTransfer: Gauge<string>,
        private sequencerScheduleService: SequencerScheduleService,
        private chainConfig: ChainConfigService
    ) {
        setInterval(this.setPendingTransfer.bind(this), 1000 * 30);
    }
    async setPendingTransfer() {
        const stores = await this.sequencerScheduleService.stores.values();
        for (const store of stores) {
            try {
                const chain = await this.chainConfig.getChainInfo(store.chainId);
                const datas = store.getSymbolsWithData();
                for (const item of datas) {
                    this.pendingTransfer.labels({
                        network: chain.name,
                        symbol: item.id
                    }).set(item.size)
                }
            } catch (error) {
                console.error(`metric ${store.chainId} setPendingTransfer error`, error);
            }
        }
    }
}
