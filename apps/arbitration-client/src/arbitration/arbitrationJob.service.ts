import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ArbitrationService } from './arbitration.service';
import { ArbitrationDB, ArbitrationTransaction } from './arbitration.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HTTPGet } from '../utils';
import { HTTPPost } from "../../../../libs/request/src";

const mutex = new Mutex();
const arbitrationHost = process.env['ArbitrationHost'];
let startTime = new Date().valueOf();

// arbitration-client
@Injectable()
export class ArbitrationJobService {
    private readonly logger: Logger = new Logger(ArbitrationJobService.name);

    constructor(
        private arbitrationService: ArbitrationService,
        private eventEmitter: EventEmitter2
    ) {
        // this.syncChainInfo()
    }

    @Interval(1000 * 5)
    async syncChainInfo() {
        const client = await this.arbitrationService.getSubClient();
        if (!client) {
            throw new Error('syncChainInfo SubClient not found');
        }
        this.arbitrationService.chainRels = await client.manager.getChainRels();
    }

    @Interval(1000 * 60)
    async syncProof() {
        if (process.env['makerList']) {
            return;
        }
        const arbitrationObj = await this.arbitrationService.jsondb.getData(`/arbitrationHash`);
        for (const hash in arbitrationObj) {
            if (arbitrationObj[hash] && arbitrationObj[hash].status) continue;
            const result = await HTTPGet(`${arbitrationHost}/proof/hash/${hash}`);
            console.log(result.data, '=== syncProof result');
            const proof: string = result.data;
            await this.arbitrationService.userSubmitProof(arbitrationObj[hash], proof);
        }
    }



    @Cron('*/5 * * * * *', {
        name: 'userArbitrationJob',
    })
    getListOfUnrefundedTransactions() {
        if (process.env['makerList']) {
            return;
        }
        this.logger.debug('Called when the current second is 45');
        if (mutex.isLocked()) {
            return;
        }
        mutex
            .runExclusive(async () => {
                const endTime = new Date().valueOf();
                const { result } = await HTTPGet(`${arbitrationHost}/transaction/unreimbursedTransactions?startTime=${startTime - 1000 * 5}&endTime=${endTime}`);
                for (const item of result.list) {
                    const result = this.arbitrationService.verifyArbitrationConditions(item as ArbitrationTransaction);
                    if (result) {
                        const data = await this.arbitrationService.jsondb.getData(`/arbitrationHash/${item.fromHash.toLowerCase()}`);
                        if (data) {
                            continue;
                        }
                        await this.arbitrationService.jsondb.push(`/arbitrationHash/${item.sourceTxHash.toLowerCase()}`, <ArbitrationDB>{
                            sourceChainId: item.sourceChainId,
                            sourceTxHash: item.sourceTxHash.toLowerCase(),
                            mdcAddress: '',
                            status: 0
                        });
                        this.eventEmitter.emit("user.arbitration.create", item);
                    }
                }
                startTime = endTime;
            });
    }

    @Cron('*/5 * * * * *', {
        name: 'makerArbitrationJob',
    })
    getListOfUnresponsiveTransactions() {
        if (!process.env['makerList']) {
            return;
        }
        const makerList = process.env['makerList'].split(',');
        this.logger.debug('Called when the current second is 45');
        if (mutex.isLocked()) {
            return;
        }
        mutex
            .runExclusive(async () => {
                const res: {
                    proof: string, hash: string, isSource: number, sourceChain: number, targetChain: number,
                    makerAddress: string, mdcAddress: string
                }[] = <any[]>await HTTPGet(`${arbitrationHost}/proof/needResponseTransactionList`);
                for (const item of res) {
                    if (!makerList.find(maker => maker.toLowerCase() === item.makerAddress.toLowerCase())) {
                        continue;
                    }
                    const result = this.arbitrationService.verifyArbitrationConditions(item as ArbitrationTransaction);
                    if (result) {
                        const data = await this.arbitrationService.jsondb.getData(`/arbitrationHash/${item.hash.toLowerCase()}`);
                        if (data) {
                            continue;
                        }
                        await this.arbitrationService.jsondb.push(`/arbitrationHash/${item.hash.toLowerCase()}`, <ArbitrationDB>{
                            toChainId: item.targetChain,
                            sourceTxHash: item.hash.toLowerCase(),
                            status: 0
                        });
                        this.logger.log(`maker response arbitration ${item.targetChain} ${item.hash}`);
                        await HTTPPost(`${arbitrationHost}/proof/needProofSubmission`, {
                            isSource: 0,
                            chainId: item.targetChain,
                            hash: item.hash
                        });
                    }
                }
            });
    }
}
