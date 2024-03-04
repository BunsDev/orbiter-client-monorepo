import { Injectable } from '@nestjs/common';
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Gauge } from "prom-client";
import { ChainConfigService } from '@orbiter-finance/config';
import { SequencerScheduleService } from '../transfer/sequencer/sequencer.schedule'
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
@Injectable()
export class MetricService {
    constructor(
        @InjectMetric("pending_transfer") public pendingTransfer: Gauge<string>,
        @InjectMetric("last_transfer") public lastTransfer: Gauge<string>,
        @InjectMetric("tranfer_lock") public tranferLock: Gauge<string>,
        
        private sequencerScheduleService: SequencerScheduleService,
        private chainConfig: ChainConfigService,
        @InjectRedis() private readonly redis: Redis,
    ) {
        this.setPendingTransfer()
    }
    async setPendingTransfer() {
        this.lastTransfer.reset();
        this.pendingTransfer.reset();
        this.tranferLock.reset();
        
        const locks = SequencerScheduleService.Lock;
        for (const id in locks) {
            const [targetChain, targetMaker] = id.split('-');
            const data = locks[id];
            const chainInfo = this.chainConfig.getChainInfo(targetChain);
            this.lastTransfer.labels({
                targetChain,
                targetChainName: chainInfo.name,
                targetMaker,
            }).set(data.prevTime)
            this.tranferLock.labels({
                targetChain,
                targetChainName: chainInfo.name,
                targetMaker,
            }).set(+data.locked)
            const queueLength = await this.redis.llen(id);
            
            this.pendingTransfer.labels({
                targetChain,
                targetChainName: chainInfo.name,
                targetMaker,
            }).set(queueLength)
         
        }
    }

    
}
