import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction, BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { ArbitrationTransaction } from "../common/interfaces/Proof.interface";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import BigNumber from "bignumber.js";
import Keyv from "keyv";
import { ArbitrationRecord, IArbitrationRecord } from "@orbiter-finance/maker-api-seq-models";
import { providers } from 'ethers';
import { Interface } from 'ethers6';
import { MDCAbi } from '@orbiter-finance/abi';
const keyv = new Keyv();

@Injectable()
export class TransactionService {
    constructor(
        protected envConfigService: ENVConfigService,
        private readonly chainConfigService: ChainConfigService,
        @InjectModel(Transfers)
        private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction,
        @InjectModel(ArbitrationRecord)
        private arbitrationRecord: typeof ArbitrationRecord,
    ) {}

    async getUnreimbursedTransactions(startTime: number, endTime: number): Promise<ArbitrationTransaction[]> {
        const bridgeTransactions = await this.bridgeTransactionModel.findAll({
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker',
                'sourceAddress', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
                'targetChain', 'targetToken', 'ebcAddress'],
            where: {
                status: 0,
                sourceTime: {
                    [Op.gte]: dayjs(startTime).toISOString(),
                    [Op.lte]: dayjs(endTime).toISOString()
                },
                ruleId: {
                    [Op.not]: null
                }
            },
            limit: 200
        });
        const dataList: ArbitrationTransaction[] = [];
        for (const bridgeTx of bridgeTransactions) {
            const mainToken = this.chainConfigService.getTokenBySymbol(String(await this.envConfigService.getAsync('MAIN_NETWORK') || 1), bridgeTx.sourceSymbol);
            if (!mainToken?.address) {
                console.error('MainToken not found', mainToken, await this.envConfigService.getAsync('MAIN_NETWORK') || 1, bridgeTx.sourceId, bridgeTx.sourceSymbol);
                continue;
            }
            const sourceToken = this.chainConfigService.getTokenBySymbol(bridgeTx.sourceChain, bridgeTx.sourceSymbol);
            if (!sourceToken?.decimals) continue;
            if (!bridgeTx?.targetToken) {
                console.error('TargetToken not found', bridgeTx.sourceId);
                continue;
            }
            const sourceTxHash = bridgeTx.sourceId;
            const transfer = await this.transfersModel.findOne(<any>{
                where: {
                    hash: sourceTxHash
                }
            });
            if (!transfer) {
                console.error('Transfer not found', sourceTxHash);
                continue;
            }
            const arbitrationTransaction: ArbitrationTransaction = {
                sourceChainId: Number(bridgeTx.sourceChain),
                sourceTxHash,
                sourceMaker: bridgeTx.sourceMaker,
                sourceAddress: bridgeTx.sourceAddress,
                sourceTxBlockNum: Number(transfer.blockNumber),
                sourceTxTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                sourceTxIndex: Number(transfer.transactionIndex),
                ebcAddress: bridgeTx.ebcAddress,
                ruleId: bridgeTx.ruleId,
                freezeAmount1: new BigNumber(bridgeTx.sourceAmount).times(10 ** sourceToken.decimals).toFixed(0),
                freezeToken: mainToken.address,
                minChallengeDepositAmount: String(await this.envConfigService.getAsync("MinChallengeDepositAmount") ?? 0.005 * 10 ** sourceToken.decimals)
            };
            dataList.push(arbitrationTransaction);
        }
        return dataList;
    }

    async getSourceIdStatus(sourceId: string): Promise<number> {
        const bridgeTransaction: BridgeTransactionAttributes = await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['status'],
            where: {
                sourceId
            }
        });
        return bridgeTransaction?.status ?? -1;
    }

    async submitChallenge(data: any) {
        await keyv.set(`${data.sourceTxHash.toLowerCase()}_challenge`, data, 60000);
    }

    async getChallenge(hash: string) {
        return await keyv.get(`${hash.toLowerCase()}_challenge`) || null;
    }


    async recordTransaction(data: {
        sourceId: string,
        hash: string
    }) {
        const count: number = <any>await this.bridgeTransactionModel.count(<any>{
            where: {
                sourceId: data.sourceId
            }
        });
        if (!count) {
            console.error('recordTransaction none of sourceId count', JSON.stringify(data));
            return;
        }
        const mainNetwork = await this.envConfigService.getAsync('MAIN_NETWORK');
        const chainInfo: any = await this.chainConfigService.getChainInfo(String(mainNetwork));
        if (!chainInfo?.rpc || !chainInfo.rpc.length) {
            console.error('recordTransaction none of chainInfo', `mainnetwork: ${mainNetwork}`);
            return;
        }
        let transferFee = "0";
        let fromAddress = '';
        let status = 0;
        let type = 0;
        let calldata = [];
        try {
            const provider = new providers.JsonRpcProvider({
                url: chainInfo.rpc[0],
            });
            const receipt = await provider.getTransactionReceipt(data.hash);
            if (!receipt) {
                console.error('recordTransaction none of receipt', `hash: ${data.hash}`);
                return;
            }
            const transaction: any = await provider.getTransaction(data.hash);
            if (!transaction) {
                console.error('recordTransaction none of transaction', `hash: ${data.hash}`);
                return;
            }
            const contractInterface = new Interface(MDCAbi);
            const parsedData = contractInterface.parseTransaction({
                data: transaction.data,
            });
            switch (parsedData.name) {
                case "challenge": {
                    type = 11;
                    break;
                }
                case "verifyChallengeSource": {
                    type = 12;
                    break;
                }
                case "verifyChallengeDest": {
                    type = 21;
                    break;
                }
            }
            calldata = (parsedData.args.toArray()).map(item => String(item));
            transferFee = new BigNumber(String(receipt.effectiveGasPrice)).multipliedBy(String(receipt.gasUsed)).dividedBy(10 ** 18).toFixed(8);
            fromAddress = receipt.from;
            status = receipt.status;
        } catch (e) {
            console.error('recordTransaction error', e);
            return;
        }
        const iArbitrationRecord: IArbitrationRecord = {
            hash: data.hash,
            fromAddress: fromAddress.toLowerCase(),
            sourceId: data.sourceId,
            transferFee,
            status,
            type,
            calldata,
            createTime: new Date().valueOf()
        };
        await this.arbitrationRecord.create(iArbitrationRecord);
    }
}
