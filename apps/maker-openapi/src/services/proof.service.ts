import { Injectable } from '@nestjs/common';
import {
    NeedProofSubmissionRequest,
    ProofData,
    ProofSubmissionRequest,
    TxData
} from '../common/interfaces/Proof.interface';
import { Level } from 'level';
import { InjectModel } from "@nestjs/sequelize";
import { BridgeTransaction } from "@orbiter-finance/seq-models";
import { keccak256, solidityPack } from "ethers/lib/utils";
import { Config, JsonDB } from "node-json-db";
import { getDecimalBySymbol } from "@orbiter-finance/utils";
import { utils } from "ethers";
import BigNumber from "bignumber.js";

@Injectable()
export class ProofService {
    public jsondb = new JsonDB(new Config("runtime/makerOpenApiDB", true, false, '/'));
    private db: Level;

    constructor(@InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction) {
        this.db = new Level('runtime/maker-openapi', { valueEncoding: 'json' });
    }

    async proofSubmission(data: ProofSubmissionRequest) {
        try {
            console.log("proofSubmission message", data.message);
            const localData: TxData = await this.jsondb.getData(`/tx/${data.transaction.toLowerCase()}`);
            if (localData) {
                let proofData: ProofData;
                if (localData.isSource) {
                    proofData = {
                        proof: data.proof,
                        hash: localData.hash,
                        mdcAddress: localData.mdcAddress,
                        makerAddress: localData.makerAddress,
                        isSource: localData.isSource,
                        sourceChain: localData.sourceChain,
                        targetChain: localData.targetChain,
                        challenger: localData.challenger,
                        spvAddress: localData.spvAddress,
                        rawDatas: localData.rawDatas,
                        rlpRuleBytes: localData.rlpRuleBytes,
                        status: +data.status,
                        message: data.message
                    };
                } else {
                    proofData = {
                        proof: data.proof,
                        hash: localData.hash,
                        mdcAddress: localData.mdcAddress,
                        makerAddress: localData.makerAddress,
                        isSource: localData.isSource,
                        sourceChain: localData.sourceChain,
                        targetChain: localData.targetChain,
                        challenger: localData.challenger,
                        spvAddress: localData.spvAddress,
                        rawDatas: localData.rawDatas,
                        rlpRuleBytes: localData.rlpRuleBytes,

                        targetNonce: localData.targetNonce,
                        targetChainId: localData.targetChain,
                        targetFrom: localData.targetFrom,
                        targetToken: localData.targetToken,
                        targetAmount: localData.targetAmount,
                        responseMakersHash: localData.responseMakersHash,
                        responseTime: localData.responseTime,

                        status: +data.status,
                        message: data.message
                    };
                }
                await this.jsondb.push(`/proof/${data.transaction.toLowerCase()}`, proofData);
                await this.jsondb.delete(`/tx/${data.transaction.toLowerCase()}`); // TODO security
            }
        } catch (e) {
            return { status: 0 };
        }
        return { status: 1 };
    }

    async getProof(hash: string) {
        return await this.jsondb.getData(`/proof/${hash.toLowerCase()}`);
    }

    async completeProof(hash: string) {
        await this.jsondb.delete(`/proof/${hash.toLowerCase()}`); // TODO security
    }

    async saveNeedProofTransactionList(data: NeedProofSubmissionRequest) {
        if (!data.chainId || !data.hash) {
            throw new Error('Invalid parameters');
        }
        let bridgeTransaction = data.isSource ? await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'targetId', 'targetChain', 'targetToken', 'ruleId'],
            where: {
                sourceChain: String(data.chainId),
                sourceId: data.hash
            }
        }) : await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker',
                'targetId', 'targetChain', 'targetToken', 'targetNonce', 'targetAddress',
                'targetAmount', 'ruleId'],
            where: {
                targetChain: String(data.chainId),
                targetId: data.hash
            }
        });
        if (!bridgeTransaction?.ruleId) {
            throw new Error(`Not the Dealer version of the deal: ${data.chainId} ${data.hash}`);
        }

        if (!bridgeTransaction?.sourceChain) {
            throw new Error(`Unable to locate transaction: ${data.chainId} ${data.hash}`);
        }

        const chain0 = toHex(bridgeTransaction.sourceChain);
        const chain1 = toHex(bridgeTransaction.targetChain);
        const token0 = bridgeTransaction.sourceToken;
        const token1 = bridgeTransaction.targetToken;
        const ruleKey: string = keccak256(solidityPack(['uint256', 'uint256', 'uint256', 'uint256'], [chain0, chain1, token0, token1]));
        let txData: TxData;
        if (data.isSource) {
            txData = {
                hash: data.hash,
                mdcAddress: data.mdcAddress,
                makerAddress: bridgeTransaction.sourceMaker,
                sourceChain: chain0,
                targetChain: chain1,
                ruleKey,
                isSource: data.isSource ? 1 : 0,
                challenger: data.challenger,
                spvAddress: data.spvAddress
            };
        } else {
            const targetDecimal = getDecimalBySymbol(bridgeTransaction.targetChain, bridgeTransaction.targetSymbol);
            const targetAmount = new BigNumber(bridgeTransaction.targetAmount).multipliedBy(10 ** targetDecimal).toFixed(0);
            const rawDatas = encodeChallengeRawDataWORule([],[],[],"")
            txData = {
                targetNonce: bridgeTransaction.targetNonce,
                targetChainId: bridgeTransaction.targetChain,
                targetFrom: bridgeTransaction.targetAddress,
                targetToken: bridgeTransaction.targetToken,
                targetAmount,
                responseMakersHash: bridgeTransaction.targetId,
                responseTime: String(60), // TODO

                hash: bridgeTransaction.sourceId,
                mdcAddress: data.mdcAddress,
                makerAddress: bridgeTransaction.sourceMaker,
                sourceChain: chain0,
                targetChain: chain1,
                ruleKey,
                isSource: data.isSource ? 1 : 0,
                challenger: data.challenger,
                spvAddress: data.spvAddress,
                rawDatas
            };
        }
        await this.jsondb.push(`/tx/${data.hash.toLowerCase()}`, txData);
    }

    async getNeedProofTransactionList() {
        let txObj: any = {};
        try {
            txObj = await this.jsondb.getData(`/tx`);
        } catch (e) {
            console.error('getNeedProofTransactionList', e.message);
        }
        const list = [];
        for (const hash in txObj) {
            const data: any = txObj[hash];
            if (data?.hash && !data?.isSource) list.push([data.hash, data.sourceChain, data.targetChain]);
        }
        return list;
    }

    async getNeedMakerResponseTransactionList(): Promise<ProofData[]> {
        let txObj: any = {};
        try {
            txObj = await this.jsondb.getData(`/proof`);
        } catch (e) {
            console.error('getNeedProofTransactionList', e.message);
        }
        const list = [];
        for (const hash in txObj) {
            const data: any = txObj[hash];
            if (data?.isSource) list.push(data);
        }
        return list;
    }
}

function toHex(num: string | number) {
    return '0x' + Number(num).toString(16);
}

function encodeChallengeRawDataWORule(dealers: string[], ebcs: string[], chainIds: number[], ebc: string) {
    return utils.defaultAbiCoder.encode(
        ['address[]', 'address[]', 'uint64[]', 'address'],
        [dealers, ebcs, chainIds, ebc],
    );
}
