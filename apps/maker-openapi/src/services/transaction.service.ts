import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models'
import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { ArbitrationTransaction } from "../common/interfaces/Proof.interface";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { keccak256 } from "@ethersproject/keccak256";
import { solidityPack } from "ethers/lib/utils";
import BigNumber from "bignumber.js";

@Injectable()
export class TransactionService {
    mainChain = 1;

    constructor(
        protected envConfigService: ENVConfigService,
        protected chainConsulService: ChainConfigService,
        private readonly chainConfigService: ChainConfigService,
        @InjectModel(Transfers)
        private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction,
    ) {
        this.init();
    }

    async init() {
        const chains = await this.chainConsulService.getAllChains();
        if (chains.find(item => +item.internalId === 5)) {
            this.mainChain = 5;
        }
    }

    async getUnreimbursedTransactions(startTime: number, endTime: number): Promise<ArbitrationTransaction[]> {
        const bridgeTransactions = await this.bridgeTransactionModel.findAll({
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
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
            const mainToken = this.chainConfigService.getTokenBySymbol(this.mainChain, bridgeTx.sourceSymbol);
            if (!mainToken?.address) {
                console.error('MainToken not found', bridgeTx.sourceId);
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
            const ruleKey: string = keccak256(solidityPack(
                ['uint256', 'uint256', 'uint256', 'uint256'],
                [+bridgeTx.sourceChain, +bridgeTx.targetChain, +bridgeTx.sourceToken, +bridgeTx.targetToken]
            ));
            const arbitrationTransaction: ArbitrationTransaction = {
                sourceChainId: Number(bridgeTx.sourceChain),
                sourceTxHash,
                sourceMaker: bridgeTx.sourceMaker,
                sourceTxBlockNum: Number(transfer.blockNumber),
                sourceTxTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                sourceTxIndex: Number(transfer.transactionIndex),
                ruleKey,
                freezeAmount1: new BigNumber(bridgeTx.sourceAmount).times(10 ** sourceToken.decimals).toFixed(0),
                freezeToken: mainToken.address,
                minChallengeDepositAmount: String(await this.envConfigService.getAsync("MinChallengeDepositAmount") || 0)
            };
            dataList.push(arbitrationTransaction);
        }
        return dataList;
    }
}
