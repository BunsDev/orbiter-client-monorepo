import { BigNumber } from 'bignumber.js';
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChainRel, SubgraphClient } from '@orbiter-finance/subgraph-sdk';
import { CronJob } from 'cron';
import { isEmpty } from 'lodash';
import {
    ethers,
    Interface,
    isError,
    keccak256,
    type Wallet,
} from "ethers6";
import { LoggerDecorator, OrbiterLogger, abis } from '@orbiter-finance/utils';
import { ArbitrationTransaction } from './arbitration.interface';
import { OnEvent } from '@nestjs/event-emitter';
@Injectable()
export class ArbitrationService {
    public chainRels: Array<ChainRel> = [];
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;
    constructor(private schedulerRegistry: SchedulerRegistry) {
    }
    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = process.env['SubgraphEndpoint']
        if (!SubgraphEndpoint) {
            throw new Error('SubgraphEndpoint not found');
        }
        return new SubgraphClient(SubgraphEndpoint);
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
    verifyArbitrationConditions(sourceTx: ArbitrationTransaction): boolean {
        return true;// TODO: test
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
            // TODO:Determine whether arbitration has occurred
            return true;
        }
        return false;
    }

    async initiateArbitration(account: ethers.Wallet, tx: ArbitrationTransaction) {
        const ifa = new Interface(abis.OrbiterRouterV3);
        if (!tx.fromChainId) {
            throw new Error('fromChainId not found');
        }
        if (!tx.fromHash) {
            throw new Error('fromHash not found');
        }
        if (!tx.fromTimestamp) {
            throw new Error('fromTimestamp not found');
        }
        if (!tx.sourceToken) {
            throw new Error('sourceToken not found');
        }
        if (!tx.sourceDecimal) {
            throw new Error('sourceDecimal not found');
        }
        if (!tx.fromAmount) {
            throw new Error('fromAmount not found');
        }
        // Obtaining arbitration deposit TODO: 
        // TODO: Verify Balance
        const data = ifa.encodeFunctionData("challenge", [
            tx.fromChainId,
            tx.fromHash,
            tx.fromTimestamp,
            tx.sourceToken,
            new BigNumber(tx.fromAmount).times(10 ** tx.sourceDecimal).times(1)
        ]);
        const client = await this.getSubClient();
        const mdcAddress = await client.maker.getMDCAddress(tx.sourceMaker);
        const transactionRequest = {
            data,
            to: mdcAddress,
            value: 0n,
            from: account.address,
        }
        const response = await account.sendTransaction(transactionRequest)
        return response;
    }


    @OnEvent('arbitration.create')
    async handleArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        const arbitrationPrivateKey = process.env["ArbitrationPrivateKey"];
        console.log(arbitrationPrivateKey, '=arbitrationPrivateKey')
        if (!arbitrationPrivateKey) {
            this.logger.error('arbitrationPrivateKey not config');
            return;
        }
        const chainId = process.env['NODE_ENV'] === 'production' ? '1' : '5';
        const arbitrationRPC = process.env["arbitrationRPC"];
        if (!arbitrationRPC) {
            this.logger.error(`${chainId} arbitrationRPC not config`);
            return;
        }
        try {
            const provider = new ethers.JsonRpcProvider(arbitrationRPC);
            const wallet = new ethers.Wallet(arbitrationPrivateKey).connect(provider);
            //
            this.logger.info(`initiateArbitration wait initiateArbitration ${payload.fromHash}`);
            const result = await this.initiateArbitration(wallet, payload);
            this.logger.info(`initiateArbitration success ${result.hash}`);
            await result.wait()
            this.logger.info(`initiateArbitration wait success ${result.hash}`);
        } catch (error) {
            this.logger.error('Arbitration encountered an exception', error);
        }

    }

}
