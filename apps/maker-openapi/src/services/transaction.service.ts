import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction, BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { Op } from 'sequelize';
import { ArbitrationTransaction } from "../common/interfaces/Proof.interface";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import BigNumber from "bignumber.js";
import Keyv from "keyv";
import { ArbitrationRecord, IArbitrationRecord } from "@orbiter-finance/maker-api-seq-models";
import { providers } from 'ethers';
import { Interface } from 'ethers6';
import axios from 'axios';
import { MDCAbi } from '@orbiter-finance/abi';
import { HTTPPost } from "@orbiter-finance/request";
const keyv = new Keyv();

@Injectable()
export class TransactionService {
    constructor(
        private envConfig: ENVConfigService,
        protected envConfigService: ENVConfigService,
        private readonly chainConfigService: ChainConfigService,
        @InjectModel(Transfers)
        private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction,
        @InjectModel(ArbitrationRecord)
        private arbitrationRecord: typeof ArbitrationRecord,
    ) {}

    async querySubgraph(query: string) {
        const subgraphEndpoint = await this.envConfig.getAsync("SubgraphEndpoint");
        if (!subgraphEndpoint) {
            console.error('SubgraphEndpoint not found');
            return null;
        }
        return HTTPPost(subgraphEndpoint, { query });
    }

    async getCreateChallengesSourceTxHashList() {
        let hashList = await keyv.get('CreateChallengesSourceTxHashList');
        if (!hashList) {
            const queryStr = `
            {
              createChallenges(orderBy: challengeNodeNumber, orderDirection: asc) {             
                sourceTxHash
              }
            }
          `;
            const result = await this.querySubgraph(queryStr);
            const challengerList = result?.data?.createChallenges;
            if (!challengerList || !challengerList.length) return [];
            hashList = challengerList.map(item => item?.sourceTxHash);
            await keyv.set('CreateChallengesSourceTxHashList', hashList, 1000 * 5);
        }
        return hashList;
    }

    async getAllRules(): Promise<{ id, chain0, chain1, chain0ResponseTime, chain1ResponseTime }[]> {
        let rules = await keyv.get('Rules');
        if (!rules) {
            const queryStr = `
           {
            mdcs {
              ruleLatest {
                ruleUpdateRel {
                  ruleUpdateVersion(
                    orderBy: updateVersion
                    orderDirection: desc
                    where: {ruleValidation: true}
                  ) {
                    id
                    chain0
                    chain1
                    chain0ResponseTime
                    chain1ResponseTime
                  }
                }
              }
            }
          }
          `;
            const result: any = await this.querySubgraph(queryStr) || {};
            const mdcs = result?.data?.mdcs || [];
            const ruleTemps = [];
            for (const mdc of mdcs) {
                const ruleLatests = mdc.ruleLatest;
                if (ruleLatests && ruleLatests.length) {
                    for (const ruleLatest of ruleLatests) {
                        const ruleUpdateRels = ruleLatest.ruleUpdateRel;
                        if (ruleUpdateRels && ruleUpdateRels.length) {
                            for (const ruleUpdateRel of ruleUpdateRels) {
                                const ruleUpdateVersions = ruleUpdateRel.ruleUpdateVersion;
                                if (ruleUpdateVersions && ruleUpdateVersions.length) {
                                    for (const rule of ruleUpdateVersions) {
                                        ruleTemps.push(rule);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            rules = ruleTemps;
            await keyv.set('Rules', rules, 1000 * 5);
        }
        return rules;
    }

    async getPendingArbitration(): Promise<{ list: ArbitrationTransaction[], nextTime: number }> {
        const isMainNetwork = +(await this.envConfigService.getAsync('MAIN_NETWORK')) === 1;
        const bridgeTransactions = await this.bridgeTransactionModel.findAll({
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker',
                'sourceAddress', 'sourceTime', 'status', 'ruleId', 'sourceSymbol', 'sourceToken',
                'targetChain', 'targetToken', 'ebcAddress'],
            where: {
                status: 0,
                sourceChain: isMainNetwork ? ["1", "324"] : ["11155111", "300"],
                ruleId: {
                    [Op.not]: null
                }
            },
            limit: 200
        });
        const dataList: ArbitrationTransaction[] = [];
        const rules = await this.getAllRules();
        const hashList:string[] = await this.getCreateChallengesSourceTxHashList();
        const nowTime = Math.floor(new Date().valueOf() / 1000);
        let nextTime = 0;
        for (const bridgeTx of bridgeTransactions) {
            const sourceTxHash = bridgeTx.sourceId;
            if (hashList.find(item => item.toLowerCase() === sourceTxHash.toLowerCase())) {
                continue;
            }
            const sourceTxTime = Math.floor(new Date(bridgeTx.sourceTime).valueOf() / 1000);
            const diffTime = nowTime - sourceTxTime;
            const rule = rules.find(item => item.id.toLowerCase() === bridgeTx?.ruleId?.toLowerCase());
            if (+rule.chain0 === +bridgeTx.sourceChain) {
                if (+diffTime < +rule.chain0ResponseTime) {
                    nextTime = Math.max(nextTime, nowTime - +rule.chain0ResponseTime);
                    continue;
                }
            } else if (+rule.chain1 === +bridgeTx.sourceChain) {
                if (+diffTime < +rule.chain1ResponseTime) {
                    nextTime = Math.max(nextTime, nowTime - +rule.chain1ResponseTime);
                    continue;
                }
            } else {
                continue;
            }
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
                sourceTxTime,
                sourceTxIndex: Number(transfer.transactionIndex),
                ebcAddress: bridgeTx.ebcAddress,
                ruleId: bridgeTx.ruleId,
                freezeAmount1: new BigNumber(bridgeTx.sourceAmount).times(10 ** sourceToken.decimals).toFixed(0),
                freezeToken: mainToken.address,
                minChallengeDepositAmount: String(await this.envConfigService.getAsync("MinChallengeDepositAmount") ?? 0.005 * 10 ** sourceToken.decimals)
            };
            dataList.push(arbitrationTransaction);
        }
        return { list: dataList, nextTime };
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
            throw new Error(`ex: RecordTransaction none of sourceId ${JSON.stringify(data)}`);
        }
        const mainNetwork = await this.envConfigService.getAsync('MAIN_NETWORK');
        const chainInfo: any = await this.chainConfigService.getChainInfo(String(mainNetwork));
        if (!chainInfo?.rpc || !chainInfo.rpc.length) {
            throw new Error(`ex: RecordTransaction none of chainInfo, mainnetwork: ${mainNetwork}`);
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
                throw new Error(`ex: RecordTransaction none of receipt ${data.hash}`);
            }
            const transaction: any = await provider.getTransaction(data.hash);
            if (!transaction) {
                throw new Error(`ex: RecordTransaction none of transaction ${data.hash}`);
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
                case "checkChallenge": {
                    type = 31;
                    break;
                }
            }
            calldata = (parsedData.args.toArray()).map(item => String(item));
            transferFee = new BigNumber(String(receipt.effectiveGasPrice)).multipliedBy(String(receipt.gasUsed)).dividedBy(10 ** 18).toFixed(8);
            fromAddress = receipt.from;
            status = receipt.status;
            if (+status === 0) {
                const telegramToken = await this.envConfigService.getAsync('TelegramToken');
                const telegramChatId = await this.envConfigService.getAsync('TelegramChatId');
                if (telegramToken && telegramChatId) {
                    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                        chat_id: telegramChatId,
                        text: `${chainInfo?.infoURL}/tx/${data.hash} ${parsedData.name} ${calldata.join(',')}`,
                        disable_notification: false,
                        parse_mode: '',
                    });
                }
            }
        } catch (e) {
            console.error('recordTransaction error', e);
            throw new Error(`ex: ${e.message}`);
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
