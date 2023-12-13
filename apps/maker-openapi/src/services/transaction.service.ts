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
import { utils, ethers } from "ethers";
import { SubgraphClient } from "../../../../libs/subgraph-sdk/src";
@Injectable()
export class TransactionService {
    mainChain = 1;

    constructor(
        protected chainConsulService: ChainConfigService,
        protected envConfigService: ENVConfigService,
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

    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = await this.envConfigService.getAsync("SubgraphEndpoint");
        if (!SubgraphEndpoint) {
            return null;
        }
        return new SubgraphClient(SubgraphEndpoint);
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
                [bridgeTx.sourceChain, bridgeTx.targetChain, bridgeTx.sourceToken, bridgeTx.targetToken]
            ));
            const client = await this.getSubClient();
            if (!client) {
                throw new Error('SubClient not found');
            }
            const mdcAddress = await client.maker.getMDCAddress(bridgeTx.sourceMaker);
            console.log("mdcAddress", mdcAddress);
            if (!mdcAddress) {
                console.error('MdcAddress not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                continue;
            }
            const res = await client.maker.getColumnArray(Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000), mdcAddress, bridgeTx.sourceMaker);
            if (!res) continue;
            const { dealers, ebcs, chainIds } = res;
            const spvAddress = "0xcB39e8Ab9d6100fa5228501608Cf0138f94c2d38"; // TODO
            const ebc = bridgeTx.ebcAddress;
            console.log('encode data', [dealers, ebcs, chainIds, ebc]);
            const rawDatas = utils.defaultAbiCoder.encode(
                ['address[]', 'address[]', 'uint64[]', 'address'],
                [dealers, ebcs, chainIds, ebc],
            );
            const rule: any = await client.maker.getRules(mdcAddress, ebc, bridgeTx.sourceMaker);
            if (!rule) {
                console.error('Rule not found', bridgeTx.sourceChain, bridgeTx.sourceId);
                continue;
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
            const arbitrationTransaction: ArbitrationTransaction = {
                sourceChainId: Number(bridgeTx.sourceChain),
                sourceTxHash,
                sourceMaker: bridgeTx.sourceMaker,
                sourceTxBlockNum: Number(transfer.blockNumber),
                sourceTxTime: Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000),
                sourceTxIndex: Number(transfer.transactionIndex),
                ruleKey,
                freezeAmount1: new BigNumber(bridgeTx.sourceAmount).times(sourceToken.decimals).toFixed(0),
                freezeToken: mainToken.address,
                parentNodeNumOfTargetNode: 0,
                spvAddress,
                rawDatas,
                rlpRuleBytes
            };
            dataList.push(arbitrationTransaction);
        }
        return dataList;
    }

    async getRawTransactionDetailBySourceId(sourceId: string) {
        return await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'sourceAddress', 'ruleId', 'sourceSymbol', 'sourceToken'],
            where: {
                sourceId
            }
        });
    }

    async getRawTransactionDetailByTargetId(targetId: string) {
        return await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceAddress', 'sourceTime', 'sourceSymbol', 'sourceToken',
                'targetId', 'targetChain', 'targetAmount', 'targetMaker', 'targetAddress', 'targetTime', 'targetSymbol', 'targetToken', 'status', 'ruleId'],
            where: {
                targetId
            }
        });
    }
}
