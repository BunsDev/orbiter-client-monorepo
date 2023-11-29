import { BigNumber } from 'bignumber.js';
import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChainRel, SubgraphClient } from '@orbiter-finance/subgraph-sdk';
import { isEmpty } from 'lodash';
import { JsonDB, Config } from 'node-json-db';
import {
    ethers,
    Interface,
} from "ethers6";
import MDCAbi from '../abi/MDC.abi.json'
import { ArbitrationTransaction } from './arbitration.interface';
import { OnEvent } from '@nestjs/event-emitter';
@Injectable()
export class ArbitrationService {
    public jsondb = new JsonDB(new Config("db", true, false, '/'));
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
        await this.jsondb.push(`/arbitrationHash/${tx.fromHash.toLowerCase()}`, {
            fromChainId: tx.fromChainId,
            sourceTxHash: tx.fromHash.toLowerCase(),
            submitSourceTxHash: response.transactionHash,
            mdcAddress,
            status: 0
        });
        // const response = await account.sendTransaction(transactionRequest)
        return response as any;
    }

    async getWallet() {
        const arbitrationPrivateKey = process.env["ArbitrationPrivateKey"];
        if (!arbitrationPrivateKey) {
            throw new Error('arbitrationPrivateKey not config');
        }
        const chainId = process.env['NODE_ENV'] === 'production' ? '1' : '5';
        const arbitrationRPC = process.env["ArbitrationRPC"];
        if (!arbitrationRPC) {
            throw new Error(`${chainId} arbitrationRPC not config`);
        }
        const provider = new ethers.JsonRpcProvider(arbitrationRPC);
        return new ethers.Wallet(arbitrationPrivateKey).connect(provider);
    }

    async submitProof(txData: any, proof: string) {
        if (!proof) {
            throw new Error(`proof is empty`);
        }
        const wallet = await this.getWallet();
        const ifa = new Interface(MDCAbi);

        const data = ifa.encodeFunctionData("", [
            proof
        ]);
        const client = await this.getSubClient();
        if (!client) {
            throw new Error('SubClient not found');
        }
        const transactionRequest = {
            data,
            to: txData.mdcAddress,
            value: 0n,
            from: wallet.address,
        };
        const response = await wallet.populateTransaction(transactionRequest);
        console.log(response, '===submitProof tx', transactionRequest);
        await this.jsondb.push(`/arbitrationHash/${txData.sourceTxHash}`, {
            ...txData,
            submitSourceProofHash: response.transactionHash,
            status: 1
        });
        return response as any;
    }

    @OnEvent('arbitration.create')
    async handleArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        try {
            const wallet = await this.getWallet()
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
