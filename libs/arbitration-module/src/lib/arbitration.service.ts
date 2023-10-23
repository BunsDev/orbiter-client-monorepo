import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChainRel } from '@orbiter-finance/subgraph-sdk';
import { CronJob } from 'cron';
import { isEmpty } from 'lodash';

@Injectable()
export class ArbitrationService {
    public chainRels: Array<ChainRel> = [];
    constructor(private schedulerRegistry: SchedulerRegistry) {
    }
    start() {
        const arbitrationJob = this.schedulerRegistry.getCronJob('arbitrationJob');
        arbitrationJob.start();
        console.log('start ArbitrationService')
    }
    close() {
        const arbitrationJob = this.schedulerRegistry.getCronJob('arbitrationJob');
        arbitrationJob.stop();
        console.log('close ArbitrationService')
    }
    verifyArbitrationConditions(sourceTx: any): boolean {
        // Arbitration time reached
        const chain = this.chainRels.find(c => c.id === sourceTx.fromChainId);
        if (!chain) {
            return false;
        }
        if (!isEmpty(sourceTx['toHash'])) {
            return false;
        }
        const fromTimestamp = +sourceTx['fromTimestamp'];
        const minVerifyChallengeSourceTime = fromTimestamp + (+chain.minVerifyChallengeSourceTxSecond)
        const maxVerifyChallengeSourceTime = fromTimestamp + (+chain.maxVerifyChallengeSourceTxSecond)
        const nowTime = Date.now();
        if (nowTime >= minVerifyChallengeSourceTime && nowTime <= maxVerifyChallengeSourceTime) {
            // Determine whether arbitration has occurred
        }
        return false;
    }
    initiateArbitration(sourceTx: any) {
        
    }

}
