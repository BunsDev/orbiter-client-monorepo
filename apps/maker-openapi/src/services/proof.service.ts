import { Injectable } from '@nestjs/common';
import {
    MakerAskProofRequest,
    ProofData,
    ProofSubmissionRequest, UserAskProofRequest
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

    constructor(
        @InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction) {
        this.db = new Level('runtime/maker-openapi', { valueEncoding: 'json' });
    }

    async proofSubmission(data: ProofSubmissionRequest) {
        try {
            console.log("proofSubmission message", data.message);
            const hash = data.transaction.toLowerCase();
            const proofData = {
                hash, status: data.status,
                proof: data.proof, message: data.message
            };
            const sourceCount = await this.bridgeTransactionModel.count(<any>{
                where: {
                    sourceId: hash
                }
            });
            if (sourceCount) {
                await this.jsondb.push(`/proof/${hash}`, { ...proofData, isSource: 1 });
                return { status: 1 };
            }
            const targetCount = await this.bridgeTransactionModel.count(<any>{
                where: {
                    targetId: hash
                }
            });
            if (targetCount) {
                await this.jsondb.push(`/proof/${hash}`, { ...proofData, isSource: 0 });
                return { status: 1 };
            }
            return { status: 0 };
        } catch (e) {
            console.error('proofSubmission error', e);
            return { status: 0 };
        }
    }

    async getProof(hash: string) {
        try {
            return await this.jsondb.getData(`/proof/${hash.toLowerCase()}`);
        } catch (e) {
            return null;
        }
    }

    async getMakerProof(hash: string) {
        try {
            const proofData = await this.jsondb.getData(`/proof/${hash.toLowerCase()}`);
            const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
                attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'sourceTime',
                    'targetId', 'targetChain', 'targetToken', 'targetNonce', 'targetAddress', 'targetMaker',
                    'targetAmount', 'ruleId', 'ebcAddress'],
                where: {
                    targetId: hash.toLowerCase()
                }
            });
            const responseMaker = bridgeTx?.targetMaker;
            if (!responseMaker) {
                console.log('none of responseMaker', bridgeTx.sourceId, bridgeTx.targetId);
                return;
            }
            const targetDecimal = getDecimalBySymbol(bridgeTx.targetChain, bridgeTx.targetSymbol);
            const targetAmount = new BigNumber(bridgeTx.targetAmount).multipliedBy(10 ** targetDecimal).toFixed(0);
            const rawDatas = utils.defaultAbiCoder.encode(
                ['uint256[]'],
                [responseMaker.toLowerCase()],
            );

            const chain0 = toHex(bridgeTx.sourceChain);
            const chain1 = toHex(bridgeTx.targetChain);
            const token0 = bridgeTx.sourceToken;
            const token1 = bridgeTx.targetToken;
            const ruleKey: string = keccak256(solidityPack(['uint256', 'uint256', 'uint256', 'uint256'], [chain0, chain1, token0, token1]));

            return {
                ...proofData,
                targetNonce: bridgeTx.targetNonce,
                targetChainId: bridgeTx.targetChain,
                targetFrom: bridgeTx.targetAddress,
                targetToken: bridgeTx.targetToken,
                targetAmount,
                responseMakersHash: bridgeTx.targetId,
                responseTime: String(60), // TODO

                hash: bridgeTx.sourceId,
                sourceMaker: bridgeTx.sourceMaker,
                sourceChain: bridgeTx.sourceChain,
                targetChain: bridgeTx.targetChain,
                ruleKey,
                isSource: 0,
                spvAddress: "0xcB39e8Ab9d6100fa5228501608Cf0138f94c2d38",
                rawDatas
            };
        } catch (e) {

        }
    }

    async completeProof(hash: string) {
        await this.jsondb.delete(`/proof/${hash.toLowerCase()}`); // TODO security
    }

    async userAskProof(data: UserAskProofRequest) {
        if (!data.hash || !data.challenger) {
            throw new Error('Invalid parameters');
        }
        await this.jsondb.push(`/userTx/${data.hash.toLowerCase()}`, {
            hash: data.hash, challenger: data.challenger
        });
    }

    async makerAskProof(data: MakerAskProofRequest) {
        if (!data.hash) {
            throw new Error('Invalid parameters');
        }
        const bridgeTransaction = await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'sourceTime',
                'targetId', 'targetChain', 'targetToken', 'targetNonce', 'targetAddress', 'targetMaker',
                'targetAmount', 'ruleId', 'ebcAddress'],
            where: {
                targetId: data.hash
            }
        });
        if (!bridgeTransaction?.ruleId) {
            throw new Error(`Not the Dealer version of the deal: ${data.hash}`);
        }

        if (!bridgeTransaction?.sourceChain) {
            throw new Error(`Unable to locate transaction: ${data.hash}`);
        }
        const chain0 = toHex(bridgeTransaction.sourceChain);
        const chain1 = toHex(bridgeTransaction.targetChain);
        await this.jsondb.push(`/makerTx/${data.hash.toLowerCase()}`, {
            hash: data.hash, sourceChain: chain0, targetChain: chain1
        });
    }

    async needMakerProofTransactionList() {
        let txObj: any = {};
        try {
            txObj = await this.jsondb.getData(`/makerTx`);
        } catch (e) {
            console.error('getNeedProofTransactionList', e.message);
        }
        const list = [];
        for (const hash in txObj) {
            const data: any = txObj[hash];
            if (data?.hash) list.push([data.hash, data.sourceChain, data.targetChain]);
        }
        return list;
    }

    async makerNeedResponseTxList(makerAddress: string): Promise<ProofData[]> {
        let txObj: any = {};
        try {
            txObj = await this.jsondb.getData(`/proof`);
        } catch (e) {
            console.error('getNeedProofTransactionList', e.message);
        }
        const list = [];
        for (const hash in txObj) {
            const data: any = txObj[hash];
            if (data.status === 1 && data?.isSource) {
                const userSubmitTx = await this.jsondb.getData(`/userTx/${data.hash.toLowerCase()}`);
                if (userSubmitTx) {
                    const count = await this.bridgeTransactionModel.count(<any>{
                        where: {
                            sourceId: data.hash.toLowerCase(),
                            sourceMaker: makerAddress.toLowerCase()
                        }
                    });
                    if (count) {
                        list.push(data);
                    }
                }
            }
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
