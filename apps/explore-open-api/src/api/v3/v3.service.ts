import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { BridgeTransaction, BridgeTransactionAttributes } from "@orbiter-finance/seq-models";
import { V2Service } from "../v2/v2.service";
import Keyv from "keyv";
import { BigIntToString } from "@orbiter-finance/utils";
import {BigNumber} from "bignumber.js"
import {
  ChainConfigService,
} from "@orbiter-finance/config";
const keyv = new Keyv();
const defaultCacheTime = 1000 * 60 * 60;

@Injectable()
export class V3Service {
  constructor(private readonly v2Service: V2Service,private chainConfigService: ChainConfigService) {
  }

  @InjectModel(BridgeTransaction) private BridgeTransactionModel: typeof BridgeTransaction;
  async getTransactionByHash(params: string[]) {
    if (!params || !(params instanceof Array) || params.length < 1 || !params[0] || params[0].substr(0, 2) !== '0x') {
      throw new Error('Invalid params');
    }
    const hash = params[0];
    const txRes = await keyv.get(`${hash}_tx`);
    if (txRes) return txRes;
    const bridgeTransaction: BridgeTransactionAttributes = <any>await this.BridgeTransactionModel.findOne(<any>{
      attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceSymbol', 'status', 'sourceTime',
        'targetTime', 'sourceAddress', 'targetAddress', 'sourceMaker', 'targetMaker'],
      raw: true,
      where: { sourceId: hash },
    });
    if (!bridgeTransaction) {
      return {
        status: -1,
        txList: [],
      };
    }
    if (!bridgeTransaction.targetId) {
      const res = {
        status: 1,
        txList: [{
          side: 0,
          status: 1,
          hash: bridgeTransaction.sourceId,
          timestamp: bridgeTransaction.sourceTime,
          chainId: bridgeTransaction.sourceChain,
          value: bridgeTransaction.sourceAmount,
          symbol: bridgeTransaction.sourceSymbol,
        }],
      };
      await keyv.set(`${hash}_tx`, res, 5000);
      return res;
    } else {
      const res = {
        status: bridgeTransaction.status,
        txList: [{
          side: 0,
          status: bridgeTransaction.status,
          hash: bridgeTransaction.sourceId,
          timestamp: bridgeTransaction.sourceTime,
          chainId: bridgeTransaction.sourceChain,
          value: bridgeTransaction.sourceAmount,
          symbol: bridgeTransaction.sourceSymbol,
        }, {
          side: 1,
          status: bridgeTransaction.status,
          hash: bridgeTransaction.targetId,
          timestamp: bridgeTransaction.targetTime,
          chainId: bridgeTransaction.targetChain,
          value: bridgeTransaction.targetAmount,
          symbol: bridgeTransaction.targetSymbol,
        }],
      };
      await keyv.set(`${hash}_tx`, res, bridgeTransaction.status === 99 ? defaultCacheTime : 5000);
      return res;
    }
  }

  async getTransactionByAddress(params: string[]) {
    if (!params || !(params instanceof Array) || params.length < 1) {
      throw new Error('Invalid params');
    }
    const address = params[0];
    if (!new RegExp(/^0x[a-fA-F0-9]{40}$/).test(address)) {
      throw new Error('Invalid address');
    }
    let limit = 10;
    let page = 1;
    if (params.length >= 2) {
      limit = Number(params[1]);
      if (params.length >= 3) {
        page = Number(params[2]);
      }
    }
    const offset = (page - 1) * 10;
    if (offset < 0) {
      throw new Error('Invalid params');
    }

    const where = { sourceAddress: address };
    const dataList: BridgeTransactionAttributes[] = <any[]>await this.BridgeTransactionModel.findAll(<any>{
      attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceSymbol', 'status', 'sourceTime',
        'targetTime', 'sourceAddress', 'targetAddress', 'sourceMaker', 'targetMaker'],
      raw: true,
      where,
      order: [['sourceTime', 'DESC']],
      // offset,
      // limit
    });
    // const count: number = <any>await this.BridgeTransactionModel.count(<any>{ where });

    let list = [];
    for (const data of dataList) {
      list.push({
        fromChainId: data.sourceChain,
        toChainId: data.targetChain,
        fromHash: data.sourceId,
        toHash: data.targetId,
        fromSymbol: data.sourceSymbol,
        fromTimestamp: data.sourceTime,
        toTimestamp: data.targetTime,
        fromValue: data.sourceAmount,
        toValue: data.targetAmount,
        status: data.status,
      });
    }
    const v2TxList = await this.v2Service.getTransactionByAddress(address);
    for (const tx of v2TxList) {
      if (list.find(item => item.fromHash.toLowerCase() === tx.fromHash.toLowerCase())) continue;
      list.push(tx);
    }
    const count = list.length;
    return { list: list.splice(offset, limit), count };
  }

  async getTxList(params: any[]) {
    let limit = 10;
    let page = 1;
    if (params.length >= 2) {
      limit = Number(params[1]);
      if (params.length >= 3) {
        page = Number(params[2]);
      }
    }
    const offset = (page - 1) * 10;
    if (offset < 0) {
      throw new Error('Invalid params');
    }

    const where = {};
    if (params.length > 0) {
      if (+params[0] === 1) {
        where['status'] = { [Op.not]: 99 };
      } else if (+params[0] === 2) {
        where['status'] = { [Op.is]: 99 };
      }
    }
    const dataList: BridgeTransactionAttributes[] = <any[]>await this.BridgeTransactionModel.findAll({
      attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceSymbol', 'status', 'sourceTime',
        'targetTime', 'sourceAddress', 'targetAddress', 'sourceMaker', 'targetMaker'],
      raw: true,
      where,
      order: [['sourceTime', 'DESC']],
      offset,
      limit,
    });
    const list: any[] = [];
    for (const data of dataList) {
      list.push({
        fromHash: data.sourceId,
        toHash: data.targetId,
        fromChainId: data.sourceChain,
        toChainId: data.targetChain,
        fromValue: data.sourceAmount,
        toValue: data.targetAmount,
        fromAmount: data.sourceAmount,
        toAmount: data.targetAmount,
        fromSymbol: data.sourceSymbol,
        status: data.status,
        fromTimestamp: data.sourceTime,
        toTimestamp: data.targetTime,
        sourceAddress: data.sourceAddress,
        sourceMaker: data.sourceMaker,
        targetMaker: data.targetMaker
      });
    }

    const count: number = <any>await this.BridgeTransactionModel.count(<any>{ where });
    return { list, count };
  }

  async getBridgeSuccessfulTransaction(params: any[]) {
    const response = {};
    for (const item of params) {
      const responseResult = await this.BridgeTransactionModel.findAll({
        attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceMaker', 'targetMaker', 'sourceAddress',
          'targetAddress', 'sourceSymbol', 'targetSymbol', 'sourceTime', 'targetTime', 'sourceToken', 'targetToken', 'dealerAddress', 'tradeFee', 'withholdingFee'],
        raw: true,
        where: {
          status: 99,
          targetChain: String(item.id),
          version: "2-0",
          targetTime: {
            [Op.gte]: dayjs(item.timestamp[0]).toISOString(),
            [Op.lte]: dayjs(item.timestamp[1]).toISOString(),
          }
        }
      })
      const rows = [];
      for (const row of responseResult) {
        const newData = BigIntToString(row);
        // newData.profit = row.tradeFee;
        // delete newData.tradeFee;
        const token = this.chainConfigService.getTokenBySymbol(String(row.sourceChain),row.sourceSymbol)
        if (token) {
          newData.tradeFee = new BigNumber(row.tradeFee).times(10**token.decimals).toFixed(0);
          newData.tradeFeeDecimals = token.decimals;
          newData.withholdingFee = new BigNumber(row.withholdingFee).times(10**token.decimals).toFixed(0);
          newData.withholdingFeeDecimals = token.decimals;
          rows.push(newData);
        }
      }
      response[item.id] = rows;
    }
    return response;
  }
}
