import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models'
import dayjs from 'dayjs';
import { Op } from 'sequelize';

@Injectable()
export class TransactionService {
    constructor(@InjectModel(Transfers)
    private transfersModel: typeof Transfers,
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction,
    ) { }
    getUnreimbursedTransactions(startTime: number, endTime: number) {
        return this.bridgeTransactionModel.findAll({
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'sourceAddress', 'ruleId', 'sourceSymbol', 'sourceToken'],
            where: {
                status: 1,
                sourceTime: {
                    [Op.gte]: dayjs(startTime).toISOString(),
                    [Op.lte]: dayjs(endTime).toISOString()
                },
            }
        });
    }
    async getRawTransactionDetail(sourceId: string) {
        const transfer = await this.transfersModel.findOne({
            attributes: ['chainId', 'hash', 'blockNumber', 'transactionIndex', 'sender', 'receiver', 'value', 'token', 'symbol', 'fee', 'status', 'nonce', 'selector'],
            where: {
                hash: sourceId
            }
        })
        return transfer;
    }
}
