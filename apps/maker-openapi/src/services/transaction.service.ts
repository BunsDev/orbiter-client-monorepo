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
    ) {
    }
    async getUnreimbursedTransactions(startTime: number, endTime: number) {
        return await this.bridgeTransactionModel.findAll({
            attributes: ['sourceId', 'sourceChain', 'sourceAmount', 'sourceMaker', 'sourceTime', 'status', 'sourceAddress', 'ruleId', 'sourceSymbol', 'sourceToken'],
            where: {
                status: 0,
                sourceTime: {
                    [Op.gte]: dayjs(startTime).toISOString(),
                    [Op.lte]: dayjs(endTime).toISOString()
                },
            },
            limit: 200
        });
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
