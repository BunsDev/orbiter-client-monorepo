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
import { ethers, utils } from "ethers";
import BigNumber from "bignumber.js";
import { SubgraphClient } from "../../../../libs/subgraph-sdk/src";
import { ENVConfigService } from "../../../../libs/config/src";

const spvAddress = "0xcB39e8Ab9d6100fa5228501608Cf0138f94c2d38";

@Injectable()
export class ProofService {
    public jsondb = new JsonDB(new Config("runtime/makerOpenApiDB", true, false, '/'));
    private db: Level;

    constructor(
        protected envConfigService: ENVConfigService,
        @InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction) {
        this.db = new Level('runtime/maker-openapi', { valueEncoding: 'json' });
    }

    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = await this.envConfigService.getAsync("SubgraphEndpoint");
        if (!SubgraphEndpoint) {
            return null;
        }
        return new SubgraphClient(SubgraphEndpoint);
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

    async getVerifyChallengeSourceParams(hash: string) {
        try {
            const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
                attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
                    'targetChain', 'targetToken', 'ebcAddress'],
                where: {
                    sourceId: hash.toLowerCase()
                }
            });
            const client = await this.getSubClient();
            if (!client) {
                console.error('SubClient not found');
                return null;
            }
            const mdcAddress = await client.maker.getMDCAddress(bridgeTx.sourceMaker);
            console.log("mdcAddress", mdcAddress);
            if (!mdcAddress) {
                console.error('MdcAddress not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                return;
            }
            const res = await client.maker.getColumnArray(Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000), mdcAddress, bridgeTx.sourceMaker);
            if (!res) return;
            const { dealers, ebcs, chainIds } = res;
            const ebc = bridgeTx.ebcAddress;
            console.log('encode data', [dealers, ebcs, chainIds, ebc]);
            const rawDatas = utils.defaultAbiCoder.encode(
                ['address[]', 'address[]', 'uint64[]', 'address'],
                [dealers, ebcs, chainIds, ebc],
            );
            const rule: any = await client.maker.getRules(mdcAddress, ebc, bridgeTx.sourceMaker);
            if (!rule) {
                console.error('Rule not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                return;
            }
            const formatRule: any[] = [
                rule.chain0,
                rule.chain1,
                rule.chain0Status,
                rule.chain1Status,
                rule.chain0Token,
                rule.chain1Token,
                rule.chain0minPrice,
                rule.chain1minPrice,
                rule.chain0maxPrice,
                rule.chain1maxPrice,
                rule.chain0WithholdingFee,
                rule.chain1WithholdingFee,
                rule.chain0TradeFee,
                rule.chain1TradeFee,
                rule.chain0ResponseTime,
                rule.chain1ResponseTime,
                rule.chain0CompensationRatio,
                rule.chain1CompensationRatio,
            ];
            // console.log('formatRule ====', formatRule);
            const rlpRuleBytes = utils.RLP.encode(
                formatRule.map((r) => utils.stripZeros(ethers.BigNumber.from(r).toHexString())),
            );

            const proofData = await this.jsondb.getData(`/proof/${hash.toLowerCase()}`);

            return {
                sourceMaker: bridgeTx.sourceMaker,
                sourceChain: bridgeTx.sourceChain,
                spvAddress,
                rawDatas,
                rlpRuleBytes,
                ...proofData
            };
        } catch (e) {
            return null;
        }
    }

    async getVerifyChallengeDestParams(hash: string) {
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
            if(!bridgeTx){
                console.error('none of bridgeTx');
                return null;
            }
            const responseMaker = bridgeTx?.targetMaker;
            if (!responseMaker) {
                console.error('none of responseMaker', bridgeTx.sourceId, bridgeTx.targetId);
                return null;
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
            const userSubmitTx = await this.jsondb.getData(`/userTx/${bridgeTx.sourceId.toLowerCase()}`);
            if (!userSubmitTx) {
                console.error('none of userSubmitTx');
                return null;
            }
            return {
                targetNonce: bridgeTx.targetNonce,
                targetChain: bridgeTx.targetChain,
                targetAddress: bridgeTx.targetAddress,
                targetToken: bridgeTx.targetToken,
                targetAmount,
                responseMakersHash: bridgeTx.targetId,
                responseTime: String(60), // TODO

                challenger: userSubmitTx.challenger,
                sourceId: bridgeTx.sourceId,
                sourceMaker: bridgeTx.sourceMaker,
                sourceChain: bridgeTx.sourceChain,
                ruleKey,
                isSource: 0,
                spvAddress,
                rawDatas,
                ...proofData
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
