import { ExchangeRateService } from './../exchange-rate/exchange-rate.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BridgeTransaction, Transfers } from "@orbiter-finance/seq-models";
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import chains from '../assets/chains.json'
export interface CurrencyData {
    outTotalFeeAmountETH: number;
    proceeds: number;
    currency: string;
}

export interface Proceeds {
    sourceSymbol: string;
    in_total_amount: string;
    targetSymbol: string;
    out_total_amount: string;
    out_total_fee: string;
    targetFeeSymbol: string;
    targetChain: string;
    targetChainName:string;
    currencyData: CurrencyData;
}
@Injectable()
export class ProceedsService {
    private chains:any[] = chains;
    constructor(
        @InjectModel(BridgeTransaction)
        private bridgeTransactionModel: typeof BridgeTransaction, private readonly exchangeRateService: ExchangeRateService) {

    }
    async getChainName(chainId:string) {
        // 
        // if (this.chains.length<=0) {
        //     await this.requestChainList();
        // }
        const chain = this.chains.find(row => String(row.chainId) == chainId);
        return chain && chain.name;
    }
    async getTodayProceeds(targetSymbol: string = 'ETH', calculateCurrency: string = targetSymbol):Promise<Proceeds[]> {
        const result = await this.bridgeTransactionModel.findAll({
            raw: true,
            attributes: [
                'sourceSymbol',
                [Sequelize.fn('SUM', Sequelize.col('sourceAmount')), 'in_total_amount'],
                'targetSymbol',
                [Sequelize.fn('SUM', Sequelize.col('targetAmount')), 'out_total_amount'],
                [Sequelize.fn('SUM', Sequelize.col('targetFee')), 'out_total_fee'],
                'targetFeeSymbol',
                'targetChain'
            ],
            where: {
                targetSymbol,
                sourceTime: {
                    [Op.gte]: dayjs().utcOffset(8).startOf('d').toISOString(),
                    [Op.lte]: dayjs().utcOffset(8).endOf('d').toISOString(),
                },
                targetId: {
                    [Op.not]: null
                }
            },
            group: ['sourceSymbol', 'targetSymbol', 'targetChain', 'targetFeeSymbol']
        });
        for (const row of result) {
            let inTotalAmount = +row['in_total_amount'];
            let outTotalAmount = +row['out_total_amount'];
            let outTotalFeeAmount = +row['out_total_fee'];
            let currencyData = {
            }
            if (row.sourceSymbol !== calculateCurrency) {
                inTotalAmount = await this.exchangeRateService.conversion(inTotalAmount, row.sourceSymbol, calculateCurrency);
                currencyData[`inTotalAmount${calculateCurrency}`] = inTotalAmount;
            }
            if (row.targetSymbol !== calculateCurrency) {
                outTotalAmount = await this.exchangeRateService.conversion(outTotalAmount, row.targetSymbol, calculateCurrency);
                currencyData[`outTotalAmount${calculateCurrency}`] = outTotalAmount;
            }
            if (row.targetFeeSymbol != calculateCurrency) {
                outTotalFeeAmount = await this.exchangeRateService.conversion(outTotalFeeAmount, row.targetFeeSymbol, calculateCurrency);
                currencyData[`outTotalFeeAmount${calculateCurrency}`] = outTotalAmount;
            }
            currencyData['proceeds'] = inTotalAmount - (outTotalAmount + outTotalFeeAmount);
            currencyData['currency'] = calculateCurrency;
            const chainName = await this.getChainName(row.targetChain);
            row['targetChainName'] = chainName;
            row['currencyData'] = currencyData;
            // proceedsResult[row.targetChain] = Number(row['in_total_amount'] -row['out_total_amount']);
        }
        console.debug(`Proceeds data: ${JSON.stringify(result)}`);
        // const total = await sumBy(result, item => item['currencyData']['proceeds']);
        return <Proceeds[]><unknown>result;
    }


}
