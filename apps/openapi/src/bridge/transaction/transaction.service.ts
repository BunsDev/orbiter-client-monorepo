import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { Op } from 'sequelize';

@Injectable()
export class TransactionService {
    constructor(
        @InjectModel(Transfers)
        private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction) {
    }

    getCrossChainTransaction(hash: string) {
        return this.bridgeTransactionModel.findOne({
            raw: true,
            attributes:['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceMaker', 'targetMaker', 'sourceAddress', 'targetAddress', 'sourceSymbol', 'targetSymbol', 'status', 'sourceTime', 'targetTime', 'ruleId'],
            where: {
                [Op.or]: {
                    sourceId: hash,
                    targetId: hash
                }
            }
        })
    }
    getTransferByHash(hash: string) {
        return this.transfersModel.findOne({
            raw: true,
            attributes: ['chainId', 'hash', 'blockNumber', 'transactionIndex', 'sender', 'receiver', 'amount', 'token', 'symbol', 'feeAmount', 'timestamp', 'status', 'nonce'],
            where: {
                hash
            }
        })
    }
}
