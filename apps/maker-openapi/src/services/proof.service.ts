import { Injectable } from '@nestjs/common';
import {
    MakerAskProofRequest,
    ProofSubmissionRequest,
    UserAskProofRequest
} from '../common/interfaces/Proof.interface';
import { InjectModel } from "@nestjs/sequelize";
import { BridgeTransaction } from "@orbiter-finance/seq-models";
import { keccak256, solidityPack } from "ethers/lib/utils";
import { getDecimalBySymbol } from "@orbiter-finance/utils";
import { ethers, utils } from "ethers";
import BigNumber from "bignumber.js";
import { SubgraphClient } from "@orbiter-finance/subgraph-sdk";
import { ENVConfigService } from "@orbiter-finance/config";
import {
    ArbitrationProof,
    ArbitrationMakerTransaction,
    ArbitrationUserTransaction,
    IArbitrationProof,
    IArbitrationMakerTransaction,
    IArbitrationUserTransaction
} from "@orbiter-finance/maker-api-seq-models";

@Injectable()
export class ProofService {
    constructor(
        protected envConfigService: ENVConfigService,
        @InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction,
        @InjectModel(ArbitrationProof) private arbitrationProof: typeof ArbitrationProof,
        @InjectModel(ArbitrationMakerTransaction) private arbitrationMakerTransaction: typeof ArbitrationMakerTransaction,
        @InjectModel(ArbitrationUserTransaction) private arbitrationUserTransaction: typeof ArbitrationUserTransaction) {}

    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = await this.envConfigService.getAsync("THEGRAPH_API");
        if (!SubgraphEndpoint) {
            return null;
        }
        return new SubgraphClient(SubgraphEndpoint);
    }

    async proofSubmission(data: ProofSubmissionRequest) {
        try {
            const hash = data.transaction.toLowerCase();
            const proofData = {
                hash, status: data.status,
                proof: data.proof, message: data.message
            };
            const sourceData = await this.bridgeTransactionModel.findOne(<any>{
                where: {
                    sourceId: hash
                }
            });
            if (sourceData) {
                const arbitrationProof: IArbitrationProof = {
                    hash,
                    sourceMaker: sourceData.sourceMaker.toLowerCase(),
                    proof: proofData.proof,
                    message: proofData.message,
                    status: proofData.status,
                    isSource: 1,
                    createTime: new Date().valueOf()
                };
                await this.arbitrationProof.create(arbitrationProof);
                return { status: 1 };
            }
            const targetData = await this.bridgeTransactionModel.findOne(<any>{
                where: {
                    targetId: hash
                }
            });
            if (targetData) {
                const arbitrationProof: IArbitrationProof = {
                    hash,
                    sourceMaker: targetData.sourceMaker.toLowerCase(),
                    proof: proofData.proof,
                    message: proofData.message,
                    status: proofData.status,
                    isSource: 0,
                    createTime: new Date().valueOf()
                };
                await this.arbitrationProof.create(arbitrationProof);
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
            if (!hash) {
                console.error('Invalid parameters');
                return [];
            }
            const proofDataList: IArbitrationProof[] = await this.arbitrationProof.findAll(<any>{
                where: {
                    hash: hash.toLowerCase(),
                    isSource: 1
                },
                order: [['status', 'DESC'], ['createTime', 'DESC']],
                raw: true
            });
            if (!proofDataList) {
                console.error('none of proofData');
                return [];
            }
            const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
                attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
                    'targetChain', 'targetToken', 'ebcAddress'],
                where: {
                    sourceId: hash.toLowerCase()
                }
            });
            if (!bridgeTx) {
                console.error('none of bridgeTx');
                return [];
            }
            const client = await this.getSubClient();
            if (!client) {
                console.error('SubClient not found');
                return [];
            }
            const mdcAddress = await client.maker.getMDCAddress(bridgeTx.sourceMaker);
            if (!mdcAddress) {
                console.error('MdcAddress not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                return [];
            }
            const res = await client.maker.getColumnArray(Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000), mdcAddress, bridgeTx.sourceMaker);
            if (!res) return [];
            const { dealers, ebcs, chainIds } = res;
            const ebc = bridgeTx.ebcAddress;
            const rawDatas = utils.defaultAbiCoder.encode(
                ['address[]', 'address[]', 'uint64[]', 'address'],
                [dealers, ebcs, chainIds, ebc],
            );
            const rule: any = await client.maker.getRules(mdcAddress, ebc, bridgeTx.sourceMaker);
            if (!rule) {
                console.error('Rule not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                return [];
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
            const rlpRuleBytes = utils.RLP.encode(
                formatRule.map((r) => utils.stripZeros(ethers.BigNumber.from(r).toHexString())),
            );

            const eraNetWorkId = await this.envConfigService.getAsync('IS_TEST_NET') ? 280 : 324;
            const envSpvAddress = await this.envConfigService.getAsync('SPV_ADDRESS');
            const envSpvAddressEra = await this.envConfigService.getAsync('SPV_ADDRESS_ERA');
            const spvAddress = +bridgeTx.sourceChain === eraNetWorkId ? envSpvAddressEra : envSpvAddress;
            const list = [];
            for (const proofData of proofDataList) {
                list.push({
                    sourceMaker: bridgeTx.sourceMaker,
                    sourceChain: bridgeTx.sourceChain,
                    spvAddress,
                    rawDatas,
                    rlpRuleBytes,
                    ...proofData
                });
            }
            return list;
        } catch (e) {
            console.error('getVerifyChallengeSourceParams error', e);
            return [];
        }
    }

    async getVerifyChallengeDestParams(hash: string) {
        try {
            if (!hash) {
                console.error('Invalid parameters');
                return [];
            }
            const proofDataList: IArbitrationProof[] = await this.arbitrationProof.findAll(<any>{
                where: {
                    hash: hash.toLowerCase(),
                    isSource: 0
                },
                order: [['status', 'DESC'], ['createTime', 'DESC']],
                raw: true
            });
            if (!proofDataList) {
                console.error('none of proofData');
                return [];
            }
            const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
                attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'sourceTime',
                    'targetId', 'targetChain', 'targetToken', 'targetNonce', 'targetAddress', 'targetMaker',
                    'targetAmount', 'ruleId', 'ebcAddress'],
                where: {
                    sourceId: hash.toLowerCase()
                }
            });
            if(!bridgeTx){
                console.error('none of bridgeTx');
                return [];
            }
            if(!bridgeTx.targetId){
                console.error('none of targetId');
                return [];
            }
            const responseMaker = bridgeTx?.targetMaker;
            if (!responseMaker) {
                console.error('none of responseMaker', bridgeTx.sourceId, bridgeTx.targetId);
                return [];
            }
            const targetDecimal = getDecimalBySymbol(bridgeTx.targetChain, bridgeTx.targetSymbol);
            const targetAmount = new BigNumber(bridgeTx.targetAmount).multipliedBy(10 ** targetDecimal).toFixed(0);

            const chain0 = toHex(bridgeTx.sourceChain);
            const chain1 = toHex(bridgeTx.targetChain);
            const token0 = bridgeTx.sourceToken;
            const token1 = bridgeTx.targetToken;
            const ruleKey: string = keccak256(solidityPack(['uint256', 'uint256', 'uint256', 'uint256'], [chain0, chain1, token0, token1]));
            const arbitrationUserTransaction: IArbitrationUserTransaction = await this.arbitrationUserTransaction.findOne(<any>{
                where: {
                    hash: bridgeTx.sourceId.toLowerCase()
                },
                order: [['createTime', 'DESC']]
            });
            if (!arbitrationUserTransaction) {
                console.error('none of arbitrationUserTransaction');
                return null;
            }
            const eraNetWorkId = await this.envConfigService.getAsync('IS_TEST_NET') ? 280 : 324;
            const envSpvAddress = await this.envConfigService.getAsync('SPV_ADDRESS');
            const envSpvAddressEra = await this.envConfigService.getAsync('SPV_ADDRESS_ERA');
            const spvAddress = +bridgeTx.sourceChain === eraNetWorkId ? envSpvAddressEra : envSpvAddress;
            const list = [];
            for (const proofData of proofDataList) {
                list.push({
                    targetNonce: bridgeTx.targetNonce,
                    targetChain: bridgeTx.targetChain,
                    targetAddress: bridgeTx.targetAddress,
                    targetToken: bridgeTx.targetToken,
                    targetAmount,

                    challenger: arbitrationUserTransaction.challenger,
                    sourceId: bridgeTx.sourceId,
                    sourceTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                    sourceMaker: bridgeTx.sourceMaker,
                    sourceChain: bridgeTx.sourceChain,
                    ruleKey,
                    isSource: 0,
                    spvAddress,
                    ...proofData
                })
            }
            return list;
        } catch (e) {
            console.error('getVerifyChallengeDestParams error', e);
            return [];
        }
    }

    async userAskProof(data: UserAskProofRequest) {
        if (!data.hash || !data.challenger) {
            throw new Error('Invalid parameters');
        }
        const hash = data.hash.toLowerCase();
        const challenger = data.challenger.toLowerCase();
        const arbitrationUserTransaction: IArbitrationUserTransaction = {
            hash,
            challenger,
            createTime: new Date().valueOf()
        };
        await this.arbitrationUserTransaction.upsert(arbitrationUserTransaction, <any>{
            hash,
            challenger
        });
    }

    async makerAskProof(data: MakerAskProofRequest) {
        if (!data?.hash) {
            throw new Error('Invalid parameters');
        }
        const bridgeTransaction = await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'sourceTime',
                'targetId', 'targetChain', 'targetToken', 'targetNonce', 'targetAddress', 'targetMaker',
                'targetAmount', 'ruleId', 'ebcAddress'],
            where: {
                sourceId: data.hash
            }
        });
        if (!bridgeTransaction?.ruleId) {
            throw new Error(`Not the Dealer version of the deal: ${data.hash}`);
        }

        if (!bridgeTransaction?.sourceChain) {
            throw new Error(`Unable to locate transaction: ${data.hash}`);
        }
        if (!bridgeTransaction.targetId) {
            throw new Error(`No payment transaction found: ${data.hash}`);
        }
        const hash = data.hash.toLowerCase();
        const arbitrationMakerTransaction: IArbitrationMakerTransaction = {
            hash: bridgeTransaction.targetId,
            sourceChain: bridgeTransaction.sourceChain,
            targetChain: bridgeTransaction.targetChain,
            createTime: new Date().valueOf()
        };
        await this.arbitrationMakerTransaction.upsert(arbitrationMakerTransaction, <any>{
            hash
        });
    }

    async needMakerProofTransactionList() {
        const dataList: IArbitrationMakerTransaction[] = await this.arbitrationMakerTransaction.findAll({
            raw: true,
            order: [['createTime', 'DESC']]
        });
        const list = [];
        for (const data of dataList) {
            if (data?.hash) list.push([data.hash, data.sourceChain, data.targetChain]);
        }
        return list;
    }

    async makerNeedResponseTxList(makerAddress: string): Promise<IArbitrationProof[]> {
        return await this.arbitrationProof.findAll({
            attributes: ['hash', 'sourceMaker'],
            where: {
                sourceMaker: makerAddress.toLowerCase(),
                status: 1,
                isSource: 1
            },
            raw: true
        });
    }
}

function toHex(num: string | number) {
    return '0x' + Number(num).toString(16);
}
