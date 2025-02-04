import { Injectable } from '@nestjs/common';
import {
    MakerAskProofRequest,
    ProofSubmissionRequest,
} from '../common/interfaces/Proof.interface';
import { InjectModel } from "@nestjs/sequelize";
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { getDecimalBySymbol } from "@orbiter-finance/utils";
import BigNumber from "bignumber.js";
import { ENVConfigService } from "@orbiter-finance/config";
import {
    ArbitrationProof,
    ArbitrationMakerTransaction,
    IArbitrationProof,
    IArbitrationMakerTransaction
} from "@orbiter-finance/maker-api-seq-models";
import { spvClientLogger } from "../utils/logger";

@Injectable()
export class ProofService {
    constructor(
        protected envConfigService: ENVConfigService,
        @InjectModel(Transfers) private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction,
        @InjectModel(ArbitrationProof) private arbitrationProof: typeof ArbitrationProof,
        @InjectModel(ArbitrationMakerTransaction) private arbitrationMakerTransaction: typeof ArbitrationMakerTransaction) {
    }

    async proofSubmission(data: ProofSubmissionRequest) {
        try {
            if (!data?.transaction) {
                spvClientLogger.info(`none of transaction, ${JSON.stringify(data)}`);
                return { status: 0 };
            }
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
            spvClientLogger.info(`none of bridgeTransaction record, ${JSON.stringify(data)}`);
            return { status: 0 };
        } catch (e) {
            spvClientLogger.info(`proofSubmission error`, data, e);
            return { status: 0 };
        }
    }

    async getVerifyChallengeSourceParams(hash: string) {
        if (!hash) {
            throw new Error('ex: Invalid parameters');
        }
        const proofDataCount: number = <any>await this.arbitrationProof.count(<any>{
            where: {
                hash: hash.toLowerCase(),
                isSource: 1
            }
        });
        if (!proofDataCount) {
            throw new Error(`ex: None of source proofData count ${hash}`);
        }
        const proofDataList: IArbitrationProof[] = await this.arbitrationProof.findAll(<any>{
            where: {
                hash: hash.toLowerCase(),
                isSource: 1
            },
            order: [['status', 'DESC'], ['createTime', 'DESC']],
            raw: true
        });
        if (!proofDataList || !proofDataList.length) {
            throw new Error(`ex: None of source proofData ${hash}`);
        }
        const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
                'targetChain', 'targetToken', 'ebcAddress'],
            where: {
                sourceId: hash.toLowerCase()
            }
        });
        if (!bridgeTx) {
            throw new Error(`ex: None of bridgeTx ${hash}`);
        }

        const eraNetWorkId = Number(await this.envConfigService.getAsync('MAIN_NETWORK') || 1) !== 1 ? 300 : 324;
        const envSpvAddress = await this.envConfigService.getAsync('SPV_ADDRESS');
        const envSpvAddressEra = await this.envConfigService.getAsync('SPV_ADDRESS_ERA');
        const spvAddress = +bridgeTx.sourceChain === eraNetWorkId ? envSpvAddressEra : envSpvAddress;
        const list = [];
        for (const proofData of proofDataList) {
            list.push({
                sourceMaker: bridgeTx.sourceMaker,
                sourceChain: bridgeTx.sourceChain,
                sourceTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                ruleId: bridgeTx.ruleId,
                ebcAddress: bridgeTx.ebcAddress,
                spvAddress,
                ...proofData
            });
        }
        return list;
    }

    async getVerifyChallengeDestParams(hash: string) {
        if (!hash) {
            throw new Error('ex: Invalid parameters');
        }
        const bridgeCount: number = <any>await this.bridgeTransactionModel.count(<any>{
            where: {
                sourceId: hash.toLowerCase()
            }
        });
        if (!bridgeCount) {
            throw new Error(`ex: None of bridgeTx count ${hash}`);
        }
        const bridgeTx = await this.bridgeTransactionModel.findOne(<any>{
            attributes: [
                'sourceId', 'sourceChain', 'sourceToken', 'sourceMaker', 'sourceTime', 'sourceNonce', 'sourceAddress',
                'targetId', 'targetChain', 'targetToken', 'targetSymbol', 'targetNonce', 'targetAddress', 'targetMaker',
                'sourceSymbol','sourceAmount','targetAmount', 'ruleId', 'ebcAddress'],
            where: {
                sourceId: hash.toLowerCase()
            }
        });
        if (!bridgeTx?.targetId) {
            throw new Error(`ex: None of targetId ${hash}`);
        }
        const proofDataList: IArbitrationProof[] = await this.arbitrationProof.findAll(<any>{
            where: {
                hash: bridgeTx.targetId.toLowerCase(),
                isSource: 0,
                message: ""
            },
            order: [['status', 'DESC'], ['createTime', 'DESC']],
            raw: true
        });
        if (!proofDataList || !proofDataList.length) {
            throw new Error(`ex: None of dest proofData, targetId: ${hash}`);
        }
        const targetDecimal = getDecimalBySymbol(bridgeTx.targetChain, bridgeTx.targetSymbol);
        const targetAmount = new BigNumber(bridgeTx.targetAmount).multipliedBy(10 ** targetDecimal).toFixed(0);
        const sourceDecimal = getDecimalBySymbol(bridgeTx.sourceChain, bridgeTx.sourceSymbol);
        const sourceAmount = new BigNumber(bridgeTx.sourceAmount).multipliedBy(10 ** sourceDecimal).toFixed(0);

        const eraNetWorkId = Number(await this.envConfigService.getAsync('MAIN_NETWORK') || 1) !== 1 ? 300 : 324;
        const envSpvAddress = await this.envConfigService.getAsync('SPV_ADDRESS');
        const envSpvAddressEra = await this.envConfigService.getAsync('SPV_ADDRESS_ERA');
        const spvAddress = +bridgeTx.sourceChain === eraNetWorkId ? envSpvAddressEra : envSpvAddress;
        const list = [];
        for (const proofData of proofDataList) {
            list.push({
                sourceNonce: bridgeTx.sourceNonce,
                targetNonce: bridgeTx.targetNonce,
                targetChain: bridgeTx.targetChain,
                sourceAddress: bridgeTx.sourceAddress,
                targetToken: bridgeTx.targetToken,
                targetAmount,
                sourceAmount,
                ruleId: bridgeTx.ruleId,
                ebcAddress: bridgeTx.ebcAddress,
                sourceId: bridgeTx.sourceId,
                sourceTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                sourceMaker: bridgeTx.sourceMaker,
                sourceChain: bridgeTx.sourceChain,
                isSource: 0,
                spvAddress,
                ...proofData
            });
        }
        return list;
    }

    async makerAskProof(data: MakerAskProofRequest) {
        if (!data?.hash) {
            throw new Error('ex: Invalid parameters');
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
        const arbitrationMakerTransaction: IArbitrationMakerTransaction = {
            hash: bridgeTransaction.targetId.toLowerCase(),
            sourceChain: bridgeTransaction.sourceChain,
            targetChain: bridgeTransaction.targetChain,
            createTime: new Date().valueOf()
        };
        await this.arbitrationMakerTransaction.upsert(arbitrationMakerTransaction, {
            conflictFields: ['hash']
        });
    }

    async needMakerProofTransactionList() {
        const dataList: IArbitrationMakerTransaction[] = await this.arbitrationMakerTransaction.findAll({
            raw: true,
            order: [['createTime', 'DESC']]
        });
        const list = [];
        for (const data of dataList) {
            if (data?.hash) {
                const proofRecordCount = await this.arbitrationProof.count(<any>{
                    where: { hash: data.hash }
                });
                if (proofRecordCount) continue;
                const transfer = await this.transfersModel.findOne(<any>{
                    attributes: ['timestamp'],
                    where: { hash: data.hash }
                });
                list.push([
                    data.hash,
                    String(data.sourceChain),
                    String(data.targetChain),
                    String(Math.floor(new Date(transfer.timestamp).valueOf() / 1000)),
                    String(Math.floor(data.createTime / 1000))
                ]);
            }
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
