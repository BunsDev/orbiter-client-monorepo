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
import { HTTPGet } from "../utils";
import { HTTPPost } from "../../../../libs/request/src";
const arbitrationHost = process.env['ArbitrationHost'];
@Injectable()
export class ArbitrationService {
    public jsondb = new JsonDB(new Config("runtime/arbitrationDB", true, false, '/'));
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

    async userSubmitProof(txData: any, proof: string) {
        if (!proof) {
            throw new Error(`proof is empty`);
        }
        const wallet = await this.getWallet();
        const ifa = new Interface(MDCAbi);

        const data = ifa.encodeFunctionData("verifyChallengeSource", [
            'spvAddress',
            proof,
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

    async makerSubmitProof(txData: any, proof: string) {
        if (!proof) {
            throw new Error(`proof is empty`);
        }
        const wallet = await this.getWallet();
        const ifa = new Interface(MDCAbi);

        const data = ifa.encodeFunctionData("verifyChallengeSource", [
            'spvAddress',
            proof,
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
        await HTTPPost(`${arbitrationHost}/proof/completeProofSubmission`, {
            hash: txData.sourceTxHash
        });
        return response as any;
    }

    @OnEvent('user.arbitration.create')
    async handleUserArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        try {
            const wallet = await this.getWallet();
            this.logger.log(`initiateArbitration wait initiateArbitration ${payload.fromHash}`);
            const result = await this.initiateArbitration(wallet, payload);
            this.logger.log(`initiateArbitration success ${result.hash} ${payload.fromHash}`);
            await HTTPPost(`${arbitrationHost}/proof/needProofSubmission`, {
                isSource: 1,
                chainId: payload.fromChainId,
                hash: payload.fromHash
            });
            this.logger.log(`initiateArbitration submit success ${result.hash} ${payload.fromHash}`);
        } catch (error) {
            this.logger.error('Arbitration encountered an exception', error);
        }
    }


    @OnEvent('maker.arbitration.create')
    async handleMakerArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        try {
            const wallet = await this.getWallet();
            this.logger.log(`maker response arbitration wait ${payload.fromHash}`);
            const result = await this.initiateArbitration(wallet, payload);
            this.logger.log(`maker response arbitration success ${result.hash} ${payload.fromHash}`);
            await HTTPPost(`${arbitrationHost}/proof/needProofSubmission`, {
                isSource: 0,
                chainId: payload.fromChainId,
                hash: payload.fromHash
            });
            this.logger.log(`maker response arbitration submit success ${result.hash} ${payload.fromHash}`);
        } catch (error) {
            this.logger.error('maker response arbitration encountered an exception', error);
        }
    }
}
