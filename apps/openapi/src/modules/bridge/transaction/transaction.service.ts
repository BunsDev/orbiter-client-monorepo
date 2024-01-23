import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { Op } from 'sequelize';

@Injectable()
export class TransactionService {
    constructor(
        @InjectModel(Transfers, 'bridge')
        private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction, 'bridge')
        private bridgeTransactionModel: typeof BridgeTransaction) {
    }

    getCrossChainTransaction(hash: string) {
        return this.bridgeTransactionModel.findOne({
            raw: true,
            attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceMaker', 'targetMaker', 'sourceAddress', 'targetAddress', 'sourceSymbol', 'targetSymbol', 'status', 'sourceTime', 'targetTime', 'ruleId'],
            where: {
                sourceId: hash
            }
        })
    }
    async getTransferByHash(hash: string) {
        const transaction: any = await this.transfersModel.findOne({
            raw: true,
            attributes: ['chainId', 'hash', 'sender', 'receiver', 'amount', 'symbol', 'timestamp', 'status', 'opStatus'],
            where: {
                hash,
            }
        });
        if (transaction) {
            if (transaction.opStatus === 99) {
                // success
                const bridgeTransaction = await this.bridgeTransactionModel.findOne({
                    attributes: ['targetChain', 'targetId', 'targetAmount', 'targetSymbol'],
                    where: {
                        sourceId: transaction.hash
                    }
                });
                if (bridgeTransaction) {
                    transaction['targetId'] = bridgeTransaction.targetId;
                    transaction['targetAmount'] = bridgeTransaction.targetAmount;
                    transaction['targetSymbol'] = bridgeTransaction.targetSymbol;
                    transaction['targetChain'] = bridgeTransaction.targetChain;
                }
            }
        }
        return transaction;
    }
}
