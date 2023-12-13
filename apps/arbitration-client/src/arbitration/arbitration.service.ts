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
import { ArbitrationDB, ArbitrationResponseTransaction, ArbitrationTransaction } from './arbitration.interface';
import { OnEvent } from '@nestjs/event-emitter';
import { HTTPPost } from "../../../../libs/request/src";
import { HTTPGet } from "../utils";
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
        // Arbitration time reached
        const chain = this.chainRels.find(c => +c.id === +sourceTx.sourceChainId);
        if (!chain) {
            return false;
        }
        const fromTimestamp = +sourceTx['sourceTxTime'];
        const minVerifyChallengeSourceTime = fromTimestamp + (+chain.minVerifyChallengeSourceTxSecond)
        const maxVerifyChallengeSourceTime = fromTimestamp + (+chain.maxVerifyChallengeSourceTxSecond)
        const nowTime = new Date().valueOf() / 1000;
        return nowTime >= minVerifyChallengeSourceTime && nowTime <= maxVerifyChallengeSourceTime;
    }

    async initiateArbitration(account: ethers.Wallet, tx: ArbitrationTransaction) {
        const ifa = new Interface(MDCAbi);
        if (!tx.sourceTxTime) {
            throw new Error('sourceTxTime not found');
        }
        if (!tx.sourceChainId) {
            throw new Error('sourceChainId not found');
        }
        if (!tx.sourceTxBlockNum) {
            throw new Error('sourceTxBlockNum not found');
        }
        if (!tx.sourceTxIndex) {
            throw new Error('sourceTxIndex not found');
        }
        if (!tx.sourceTxHash) {
            throw new Error('sourceTxHash not found');
        }
        if (!tx.ruleKey) {
            throw new Error('ruleKey not found');
        }
        if (!tx.freezeToken) {
            throw new Error('freezeToken not found');
        }
        if (!tx.freezeAmount1) {
            throw new Error('freezeAmount1 not found');
        }
        // Obtaining arbitration deposit
        // TODO: Verify Balance
        const data = ifa.encodeFunctionData("challenge", [
            tx.sourceTxTime,
            tx.sourceChainId,
            tx.sourceTxBlockNum,
            tx.sourceTxIndex,
            tx.sourceTxHash,
            tx.ruleKey,
            tx.freezeToken,
            new BigNumber(tx.freezeAmount1),
            tx.parentNodeNumOfTargetNode || 0
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
        await this.jsondb.push(`/arbitrationHash/${tx.sourceTxHash.toLowerCase()}`, {
            fromChainId: tx.sourceChainId,
            sourceTxHash: tx.sourceTxHash.toLowerCase(),
            submitSourceTxHash: response.transactionHash,
            mdcAddress,
            status: 0
        });
        this.logger.log(`initiateArbitration success ${tx.sourceTxHash} ${response.transactionHash}`);
        await HTTPPost(`${arbitrationHost}/proof/needProofSubmission`, {
            isSource: 1,
            chainId: tx.sourceChainId,
            hash: tx.sourceTxHash,
            mdcAddress
        });
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

    async userSubmitProof(txData: ArbitrationDB, proof: string) {
        if (!proof) {
            throw new Error(`proof is empty`);
        }
        const client = await this.getSubClient();
        if (!client) {
            throw new Error('SubClient not found');
        }
        const wallet = await this.getWallet();
        const ifa = new Interface(MDCAbi);
        const data = ifa.encodeFunctionData("verifyChallengeSource", [
            txData.challenger,
            txData.spvAddress,
            txData.sourceChainId,
            proof,
            txData.rawDatas,
            txData.rlpRuleBytes
        ]);
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

    async makerSubmitProof(txData: ArbitrationDB, proof: string) {
        if (!proof) {
            throw new Error(`proof is empty`);
        }
        const wallet = await this.getWallet();
        const ifa = new Interface(MDCAbi);

        const client = await this.getSubClient();
        if (!client) {
            throw new Error('SubClient not found');
        }

        const chain = this.chainRels.find(c => +c.id === +txData.sourceChainId);
        if (!chain) {
            throw new Error('ChainRels not found');
        }
        const verifiedSourceTxData = [
            +chain.minVerifyChallengeSourceTxSecond,
            +chain.maxVerifyChallengeSourceTxSecond,
            +txData.targetNonce,
            +txData.targetChainId,
            +txData.targetFrom,
            +txData.targetToken,
            +txData.targetAmount,
            +txData.responseMakersHash,
            +txData.responseTime,
        ];
        const data = ifa.encodeFunctionData("verifyChallengeDest", [
            txData.challenger,
            txData.spvAddress,
            txData.sourceChainId,
            txData.sourceTxHash,
            proof,
            verifiedSourceTxData,
            txData.rawDatas
        ]);
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

    @OnEvent('user.arbitration.create')
    async handleUserArbitrationCreatedEvent(payload: ArbitrationTransaction) {
        try {
            const wallet = await this.getWallet();
            this.logger.log(`initiateArbitration wait initiateArbitration ${payload.sourceTxHash}`);
            const result = await this.initiateArbitration(wallet, payload);
            this.logger.log(`initiateArbitration submit success ${result.hash} ${payload.sourceTxHash}`);
        } catch (error) {
            this.logger.error('Arbitration encountered an exception', error);
        }
    }
}
