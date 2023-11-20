import { BigNumber } from 'bignumber.js';
import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChainRel, SubgraphClient } from '@orbiter-finance/subgraph-sdk';
import { isEmpty } from 'lodash';
import {
    ethers,
    Interface,
} from "ethers6";
import MDCAbi from '../abi/MDC.abi.json'
import { ArbitrationTransaction } from './arbitration.interface';
import { OnEvent } from '@nestjs/event-emitter';
@Injectable()
export class ArbitrationService {
    public chainRels: Array<ChainRel> = [];
    private readonly logger: Logger = new Logger(ArbitrationService.name);
    constructor(private schedulerRegistry: SchedulerRegistry) {
    }
    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = process.env['SubgraphEndpoint']
        if (!SubgraphEndpoint) {
            throw new Error('SubgraphEndpoint not found');
        }
        return new SubgraphClient(SubgraphEndpoint);
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
        const ifa = new Interface(MDCAbi);
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
            tx.fromTimestamp,
            tx.fromChainId,
            0,
            tx.fromHash,
            tx.fromTimestamp,
            tx.sourceToken,
            new BigNumber(tx.fromAmount).times(10 ** tx.sourceDecimal).times(1)
        ]);
        const client = await this.getSubClient();
        if (!client) {
            throw new Error('SubClient not found');
        }
        const mdcAddress = await client.maker.getMDCAddress(tx.sourceMaker);
        const transactionRequest = {
            data,
            to: mdcAddress,
            value: 0n,
            from: account.address,
        }
        const response = await account.populateTransaction(transactionRequest);
        console.log(response, '===tx', transactionRequest)
        // const response = await account.sendTransaction(transactionRequest)
        return response as any;
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
        const arbitrationRPC = process.env["ArbitrationRPC"];
        if (!arbitrationRPC) {
            this.logger.error(`${chainId} arbitrationRPC not config`);
            return;
        }
        try {
            const provider = new ethers.JsonRpcProvider(arbitrationRPC);
            const wallet = new ethers.Wallet(arbitrationPrivateKey).connect(provider);
            //
            this.logger.log(`initiateArbitration wait initiateArbitration ${payload.fromHash}`);
            const result = await this.initiateArbitration(wallet, payload);
            this.logger.log(`initiateArbitration success ${result.hash}`);
            // await result.wait()
            this.logger.log(`initiateArbitration wait success ${result.hash}`);
        } catch (error) {
            this.logger.error('Arbitration encountered an exception', error);
        }

    }

}
