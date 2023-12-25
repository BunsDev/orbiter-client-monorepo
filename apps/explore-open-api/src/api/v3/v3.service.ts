import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { BridgeTransaction, BridgeTransactionAttributes } from "@orbiter-finance/seq-models";
import { V2Service } from "../v2/v2.service";
import Keyv from "keyv";
import { BigIntToString, getDecimalBySymbol, addressPadStart } from "@orbiter-finance/utils";
import {BigNumber} from "bignumber.js"
import {
  ChainConfigService, ENVConfigService,
} from "@orbiter-finance/config";
import axios from "axios";
import { ITradingPair } from "../api.interface";
const keyv = new Keyv();
const defaultCacheTime = 1000 * 60 * 60;

@Injectable()
export class V3Service {
  constructor(private readonly v2Service: V2Service,
              private chainConfigService: ChainConfigService,
              private envConfigService: ENVConfigService) {
  }

  @InjectModel(BridgeTransaction) private BridgeTransactionModel: typeof BridgeTransaction;
  async getTransactionByHash(params: string[]) {
    if (!params || !(params instanceof Array) || params.length < 1 || !params[0]) {
      throw new Error('Invalid params');
    }
    const hash = String(params[0]).toLowerCase();
    const txRes = await keyv.get(`${hash}_tx`);
    if (txRes) return txRes;
    const bridgeTransaction: BridgeTransactionAttributes = <any>await this.BridgeTransactionModel.findOne(<any>{
      attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceSymbol', 'status', 'sourceTime',
        'targetTime', 'sourceAddress', 'targetAddress', 'sourceMaker', 'targetMaker'],
      raw: true,
      where: { sourceId: hash },
    });
    if (!bridgeTransaction) {
      return await this.v2Service.getTransactionByHash(params);
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
    const address: string = String(params[0]).toLowerCase();
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
      offset,
      limit
    });
    const count: number = <any>await this.BridgeTransactionModel.count(<any>{ where });

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
    // const v2TxList = await this.v2Service.getTransactionByAddress(address);
    // for (const tx of v2TxList) {
    //   if (list.find(item => item.fromHash.toLowerCase() === tx.fromHash.toLowerCase())) continue;
    //   list.push(tx);
    // }
    // list = list.sort(function (a, b) {
    //   return new Date(b.fromTimestamp).valueOf() - new Date(a.fromTimestamp).valueOf();
    // });
    // const count = list.length;
    return { list, count };
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
    const offset = (page - 1) * limit;
    if (offset < 0) {
      throw new Error('Invalid params');
    }

    const where: any = {};
    if (params.length > 0) {
      if (+params[0] === 1) {
        where['status'] = { [Op.not]: 99 };
      } else if (+params[0] === 2) {
        where['status'] = 99;
      }
    }
    if (params.length >= 4 && params[3]) {
      const address: string = String(params[3]).toLowerCase();
      if (!new RegExp(/^0x[a-fA-F0-9]{40}$/).test(address) && address.length !== 66) {
        throw new Error('Invalid address');
      }
      where['sourceMaker'] = address;
    }
    if (params.length >= 5 && params[4].length >= 2) {
      try {
        let beginTime;
        let endTime;
        if (isNumber(params[4][0]) && isNumber(params[4][1])) {
          beginTime = Number(params[4][0]);
          endTime = Number(params[4][1]);
        } else {
          beginTime = new Date(params[4][0]).valueOf();
          endTime = new Date(params[4][1]).valueOf();
        }
        where['sourceTime'] = {
          [Op.gte]: dayjs(beginTime).toISOString(),
          [Op.lte]: dayjs(endTime).toISOString(),
        };
      } catch (e) {
        console.error(e);
        throw new Error('Invalid time parameter');
      }
    }
    if (params.length >= 6 && params[5]) {
      where['sourceChain'] = params[5];
    }
    if (params.length >= 7 && params[6]) {
      where['targetChain'] = params[6];
    }
    if (params.length >= 8 && params[7]) {
      where['sourceId'] = params[7];
    }
    if (params.length >= 9 && params[8]) {
      where['targetId'] = params[8];
    }
    if (params.length >= 10 && params[9]) {
      if (+params[9] === 1) {
        where[Op.or] = [{ version: '1-0' }, { version: '1-1' }];
      } else if (+params[9] === 2) {
        where[Op.or] = [{ version: '2-0' }, { version: '2-1' }];
      }
    }
    const dataList: BridgeTransactionAttributes[] = <any[]>await this.BridgeTransactionModel.findAll({
      attributes: ['sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount', 'sourceSymbol', 'status', 'sourceTime',
        'targetTime', 'sourceAddress', 'targetAddress', 'sourceMaker', 'targetMaker', 'sourceSymbol', 'targetSymbol', 'sourceToken', 'targetToken'],
      raw: true,
      where,
      order: [['sourceTime', 'DESC']],
      offset,
      limit,
    });
    let list: any[] = [];
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
        fromTimestamp: new Date(String(data.sourceTime)).valueOf(),
        toTimestamp: new Date(String(data.targetTime)).valueOf(),
        sourceAddress: data.sourceAddress,
        targetAddress: data.targetAddress,
        sourceMaker: data.sourceMaker,
        targetMaker: data.targetMaker,
        sourceToken: data.sourceToken,
        targetToken: data.targetToken,
        sourceDecimal: getDecimalBySymbol(data.sourceChain, data.sourceSymbol),
        targetDecimal: getDecimalBySymbol(data.targetChain, data.targetSymbol)
      });
    }

    list = list.sort(function (a, b) {
      return new Date(b.fromTimestamp).valueOf() - new Date(a.fromTimestamp).valueOf();
    });
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
        newData.sourceTime = dayjs(row.sourceTime).valueOf();
        newData.targetTime = dayjs(row.targetTime).valueOf();
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

  async getDealerRuleLatest(params: any[]) {
    if (!params.length) {
      return null
    }
    let timestamp = new Date().valueOf();
    const dealerAddress = params[0].toLowerCase();
    if (params.length === 2) {
      timestamp = +params[1];
      if (!timestamp) {
        return null;
      }
    }
    if (!new RegExp(/^0x[a-fA-F0-9]{40}$/).test(dealerAddress)) {
      return null;
    }
    const thegraphApi = await this.envConfigService.getAsync('THEGRAPH_API');
    if (!thegraphApi) {
      return null;
    }
    let response: any;
    let responseCache: any;
    const cache = await keyv.get(`${dealerAddress}_rule`);
    if (cache) {
      response = cache;
    } else {
      const res = await axios.post(thegraphApi, {
        query: `{
        chainRels {
            id
            tokens {
              tokenAddress
              symbol
              name
              decimals
            }
            nativeToken
          }
        dealer(id: "${dealerAddress}") {
            mdcs {
            id
            owner
            chainIdSnapshot {
              chainIdMappingSnapshot{
                  chainId
                  chainIdIndex
                  enableTimestamp
              }
            }
            ebcSnapshot {
              ebcMappingSnapshot{
                ebcAddr
                ebcIndex
                enableTimestamp
              }
            }
            dealerSnapshot {
              dealerMappingSnapshot {
                 dealerAddr
                 dealerIndex
                 enableTimestamp
              }
            }
            ruleSnapshot(orderBy: version, orderDirection: desc) {
              version
              ebc {
                id
              }
              ruleLatest{
                id
                chain0
                chain0ResponseTime
                chain0Status
                chain0Token
                chain0TradeFee
                chain0WithholdingFee
                chain0maxPrice
                chain0minPrice
                chain1
                chain0CompensationRatio
                chain1CompensationRatio
                chain1ResponseTime
                chain1Status
                chain1Token
                chain1TradeFee
                chain1WithholdingFee
                chain1maxPrice
                chain1minPrice
                ruleValidation
                enableTimestamp
              }
            }
          }
        }
      }`,
      });
      response = res.data?.data;
      responseCache = JSON.parse(JSON.stringify(response));
    }
    if (!response?.dealer || !response?.chainRels) return [];
    let updateTime = 0;
    const v3ChainList = await this.convertV3ChainList(response.chainRels);
    const mdcs: any[] = response.dealer.mdcs || [];
    const marketList = [];
    const makerAddressList = [];
    for (const mdc of mdcs) {
      if(!mdc?.chainIdSnapshot.length) continue;
      if(!mdc?.ebcSnapshot.length) continue;
      if(!mdc?.dealerSnapshot.length) continue;
      const whiteListConfig = await this.envConfigService.getAsync('WHITE_LIST');
      if (whiteListConfig) {
        const whiteList = whiteListConfig.split(',');
        if (!whiteList.find(address => address.toLowerCase() === mdc.owner.toLowerCase())) {
          continue;
        }
      }
      const chainIdMap = {};
      const ebcIdMap = {};
      const dealerIdMap = {};

      mdc.chainIdSnapshot.sort(function (a, b) {
        return a.chainIdMappingSnapshot[0].enableTimestamp - b.chainIdMappingSnapshot[0].enableTimestamp;
      }).forEach((item) => {
        if (item.chainIdMappingSnapshot.length) {
          const enableTimestamp = +item.chainIdMappingSnapshot[0].enableTimestamp * 1000;
          if (enableTimestamp > timestamp) {
            if (!updateTime) updateTime = enableTimestamp;
            updateTime = Math.min(updateTime, enableTimestamp);
          } else {
            for (const snapshot of item.chainIdMappingSnapshot) {
              chainIdMap[snapshot.chainId] = snapshot.chainIdIndex;
            }
          }
        }
      });

      mdc.ebcSnapshot.sort(function (a, b) {
        return a.ebcMappingSnapshot[0].enableTimestamp - b.ebcMappingSnapshot[0].enableTimestamp;
      }).forEach((item) => {
        if (item.ebcMappingSnapshot.length) {
          const enableTimestamp = +item.ebcMappingSnapshot[0].enableTimestamp * 1000;
          if (enableTimestamp > timestamp) {
            if (!updateTime) updateTime = enableTimestamp;
            updateTime = Math.min(updateTime, enableTimestamp);
          } else {
            for (const snapshot of item.ebcMappingSnapshot) {
              ebcIdMap[snapshot.ebcAddr.toLowerCase()] = snapshot.ebcIndex;
            }
          }
        }
      });

      mdc.dealerSnapshot.sort(function (a, b) {
        return a.dealerMappingSnapshot[0].enableTimestamp - b.dealerMappingSnapshot[0].enableTimestamp;
      }).forEach((item) => {
        if (item.dealerMappingSnapshot.length) {
          const enableTimestamp = +item.dealerMappingSnapshot[0].enableTimestamp * 1000;
          if (enableTimestamp > timestamp) {
            if (!updateTime) updateTime = enableTimestamp;
            updateTime = Math.min(updateTime, enableTimestamp);
          } else {
            for (const snapshot of item.dealerMappingSnapshot) {
              dealerIdMap[snapshot.dealerAddr.toLowerCase()] = snapshot.dealerIndex;
            }
          }
        }
      });

      const ruleSnapshots = mdc.ruleSnapshot.sort(function(a, b) {
        return b.version - a.version;
      });
      const nextUpdateTimeMap = {};
      for (const ruleSnapshot of ruleSnapshots) {
        const ebcId = ebcIdMap[ruleSnapshot.ebc.id.toLowerCase()];
        if (!ebcId) {
          continue;
        }
        const rules = ruleSnapshot?.ruleLatest;
        if (!rules) continue;
        for (const rule of rules) {
          const fromId = rule.chain0 + rule.chain0Token + rule.chain1 + rule.chain1Token + mdc.owner;
          const toId = rule.chain1 + rule.chain1Token + rule.chain0 + rule.chain0Token + mdc.owner;
          const enableTimestamp = +rule.enableTimestamp * 1000;
          if (enableTimestamp > timestamp) {
            if (!updateTime) updateTime = enableTimestamp;
            updateTime = Math.min(updateTime, enableTimestamp);
            nextUpdateTimeMap[fromId] = nextUpdateTimeMap[fromId] || 0;
            nextUpdateTimeMap[toId] = nextUpdateTimeMap[toId] || 0;
            nextUpdateTimeMap[fromId] = Math.min(nextUpdateTimeMap[fromId], enableTimestamp);
            nextUpdateTimeMap[toId] = Math.min(nextUpdateTimeMap[toId], enableTimestamp);
            continue;
          }
          if (!rule.ruleValidation) {
            continue;
          }
          const dealerId = dealerIdMap[dealerAddress.toLowerCase()];
          const token0 = this.getTokenByTokenAddress(v3ChainList, String(rule.chain0), rule.chain0Token);
          const token1 = this.getTokenByTokenAddress(v3ChainList, String(rule.chain1), rule.chain1Token);
          const chainInfo0 = v3ChainList.find(item => item.chainId === String(rule.chain0));
          const chainInfo1 = v3ChainList.find(item => item.chainId === String(rule.chain1));
          if (!token0 || !token1 || !chainInfo0 || !chainInfo1) {
            continue;
          }
          if (rule.chain0Status) {
            const maxPrice = floor(Number(new BigNumber(rule.chain0maxPrice).dividedBy(10 ** token0.decimals)), token0.decimals);
            const minPrice = ceil(Number(new BigNumber(rule.chain0minPrice).dividedBy(10 ** token0.decimals)), token0.decimals);
            if (new BigNumber(maxPrice).gte(minPrice) &&
              rule.chain0WithholdingFee.substr(rule.chain0WithholdingFee.length - 4, 4) === '0000' &&
              !marketList.find(item => item.id === fromId)) {
              const makerAddress = mdc.owner.toLowerCase();
              makerAddressList.push(makerAddress);
              marketList.push({
                version: ruleSnapshot.version,
                ruleId: rule.id,
                pairId: `${rule.chain0}-${rule.chain1}:${token0.symbol}-${token1.symbol}`,
                id: fromId,
                dealerId,
                ebcId,
                ebcAddress: ruleSnapshot.ebc.id,
                recipient: makerAddress,
                sender: makerAddress,
                gasFee: new BigNumber(rule.chain0TradeFee).dividedBy(1000).toFixed(6),
                tradingFee: new BigNumber(rule.chain0WithholdingFee).dividedBy(10 ** token0.decimals).toFixed(),
                spentTime: rule.chain0ResponseTime,
                // status: rule.chain0Status,
                fromChain: {
                  id: chainIdMap[rule.chain0],
                  networkId: rule.chain0,
                  chainId: rule.chain0,
                  name: chainInfo0.name,
                  symbol: token0.symbol,
                  tokenAddress: token0.address,
                  decimals: token0.decimals,
                  maxPrice,
                  minPrice,
                  _maxPrice: rule.chain0maxPrice,
                  _minPrice: rule.chain0minPrice,
                },
                toChain: {
                  id: chainIdMap[rule.chain1],
                  networkId: rule.chain1,
                  chainId: rule.chain1,
                  name: chainInfo1.name,
                  symbol: token1.symbol,
                  tokenAddress: token1.address,
                  decimals: token1.decimals,
                },
                _compensationRatio: rule.chain0CompensationRatio,
                _tradeFee: rule.chain0TradeFee,
                _withholdingFee: rule.chain0WithholdingFee,
                nextUpdateTime: nextUpdateTimeMap[fromId] || 0,
              });
            }
          }
          if (rule.chain1Status) {
            const maxPrice = floor(Number(new BigNumber(rule.chain1maxPrice).dividedBy(10 ** token1.decimals)), token1.decimals);
            const minPrice = ceil(Number(new BigNumber(rule.chain1minPrice).dividedBy(10 ** token1.decimals)), token1.decimals);
            if (new BigNumber(maxPrice).gte(minPrice) &&
              rule.chain1WithholdingFee.substr(rule.chain1WithholdingFee.length - 4, 4) === '0000' &&
              !marketList.find(item => item.id === toId)) {
              const makerAddress = mdc.owner.toLowerCase();
              makerAddressList.push(makerAddress);
              marketList.push({
                version: ruleSnapshot.version,
                ruleId: rule.id,
                pairId: `${rule.chain1}-${rule.chain0}:${token1.symbol}-${token0.symbol}`,
                id: toId,
                dealerId,
                ebcId,
                ebcAddress: ruleSnapshot.ebc.id,
                recipient: makerAddress,
                sender: makerAddress,
                gasFee: new BigNumber(rule.chain1TradeFee).dividedBy(1000).toFixed(6),
                tradingFee: new BigNumber(rule.chain1WithholdingFee).dividedBy(10 ** token1.decimals).toFixed(),
                spentTime: rule.chain1ResponseTime,
                // status: rule.chain1Status,
                fromChain: {
                  id: Number(chainIdMap[rule.chain1]),
                  networkId: rule.chain1,
                  chainId: rule.chain1,
                  name: chainInfo1.name,
                  symbol: token1.symbol,
                  tokenAddress: token1.address,
                  decimals: token1.decimals,
                  maxPrice,
                  minPrice,
                  _maxPrice: rule.chain1maxPrice,
                  _minPrice: rule.chain1minPrice,
                },
                toChain: {
                  id: Number(chainIdMap[rule.chain0]),
                  networkId: rule.chain0,
                  chainId: rule.chain0,
                  name: chainInfo0.name,
                  symbol: token0.symbol,
                  tokenAddress: token0.address,
                  decimals: token0.decimals,
                },
                _compensationRatio: rule.chain1CompensationRatio,
                _tradeFee: rule.chain1TradeFee,
                _withholdingFee: rule.chain1WithholdingFee,
                nextUpdateTime: nextUpdateTimeMap[toId] || 0,
              });
            }
          }
        }
      }
    }
    if ((!updateTime || updateTime > new Date().valueOf() + 60 * 1000) && !cache) {
      await keyv.set(`${dealerAddress}_rule`, responseCache, 50 * 1000);
    }
    return { ruleList: marketList, updateTime, version: V2Service.updateTime };
  }

  async calculatedAmount(params: any[]) {
    if (params.length < 2) {
      throw new Error('Invalid params');
    }
    let v3Rules = [];
    const pairId: string = params[0];
    const amount: string = params[1];
    if (params.length >= 3) {
      const res: any = await this.getDealerRuleLatest([params[2]]);
      v3Rules = res?.ruleList || [];
    }
    if (!isNumber(amount)) {
      throw new Error(`Invalid amount`);
    }
    const tradingPair: ITradingPair = [...v3Rules, ...V2Service.tradingPairs].find(item => item.pairId === pairId);
    if (!tradingPair) {
      throw new Error(`Invalid pairId`);
    }
    if (new BigNumber(tradingPair.fromChain.maxPrice).lt(amount)) {
      throw new Error(`Maximum amount limited to ${tradingPair.fromChain.maxPrice}`);
    }
    if (new BigNumber(tradingPair.fromChain.minPrice).gt(amount)) {
      throw new Error(`Minimum amount limited to ${tradingPair.fromChain.minPrice}`);
    }
    return calculateAmountByLarge(tradingPair, amount);
  }

  convertV3ChainList(chainRels) {
    const chainList = this.chainConfigService.getAllChains();
    const v3ChainList = [];
    for (const chain of chainRels) {
      const v3Tokens = chain.tokens;
      if (!chain.id || !v3Tokens?.length) continue;
      const v3ChainInfo = chainList.find(item=>item.chainId === chain.id);
      if (!v3ChainInfo) continue;
      const newV3ChainInfo = JSON.parse(JSON.stringify(v3ChainInfo));
      if (chain.nativeToken.toLowerCase() !== addressPadStart(newV3ChainInfo.nativeCurrency.address, 66)) {
        newV3ChainInfo.nativeCurrency = {};
      }
      for (const token of v3Tokens) {
        token.address = token.tokenAddress = "0x" + token.tokenAddress.substr(26);
        if (token.symbol.indexOf("USDC") !== -1) {
          token.symbol = "USDC";
        }
        if (token.symbol.indexOf("USDT") !== -1) {
          token.symbol = "USDT";
        }
        if (token.symbol.indexOf("DAI") !== -1) {
          token.symbol = "DAI";
        }
      }
      newV3ChainInfo.tokens = v3Tokens
      v3ChainList.push(newV3ChainInfo);
    }
    return v3ChainList;
  }

  getTokenByTokenAddress(v3ChainList, chainId, tokenAddress) {
    const chainInfo = v3ChainList.find(item => item.chainId === String(chainId));
    if (!chainInfo) return null;
    const tokenList = this.getChainTokenList(chainInfo);
    return tokenList.find(item => addressPadStart(item.address, 66).toLowerCase() === tokenAddress.toLowerCase());
  }

  getChainTokenList(chain) {
    const allTokenList = [];
    if (!chain) return [];
    if (chain.tokens && chain.tokens.length) {
      allTokenList.push(...chain.tokens);
    }
    if (chain.nativeCurrency) {
      allTokenList.push(chain.nativeCurrency);
    }
    return allTokenList;
  }
}

function ceil(n, decimals = 6) {
  const fix = Math.min(decimals - 4, 6);
  return Number(new BigNumber(Math.ceil(n * 10 ** fix)).dividedBy(10 ** fix));
}

function floor(n, decimals = 6) {
  const fix = Math.min(decimals - 4, 6);
  return Number(new BigNumber(Math.floor(n * 10 ** fix)).dividedBy(10 ** fix));
}

function isNumber(str) {
  return !isNaN(parseFloat(str)) && isFinite(str);
}

function calculateAmountByLarge(tradingPair: ITradingPair, sendAmount: string) {
  const decimals = tradingPair.fromChain.decimals;
  const sendAmountWithoutTradingFee = new BigNumber(sendAmount);
  const gasFee = sendAmountWithoutTradingFee
    .multipliedBy(new BigNumber(tradingPair.gasFee))
    .dividedBy(new BigNumber(1000));
  const digit = decimals === 18 ? 5 : 2;
  const gasFee_fix = gasFee.decimalPlaces(digit, BigNumber.ROUND_UP);
  const toAmount_fee = sendAmountWithoutTradingFee.minus(gasFee_fix);

  if (!toAmount_fee || !isNumber(toAmount_fee)) {
    throw new Error("Amount parsing error");
  }
  const _receiveValue: string = toAmount_fee.multipliedBy(new BigNumber(10 ** decimals)).toFixed();
  const p_text = safeCode(tradingPair);
  sendAmount = getTAmountFromRAmount(+tradingPair.fromChain.id, new BigNumber(sendAmount).multipliedBy(10 ** decimals).toFixed(), p_text);
  const _sendValue = new BigNumber(sendAmount).plus(new BigNumber(tradingPair.tradingFee).multipliedBy(10 ** decimals));
  return {
    _receiveValue,
    _sendValue,
    receiveValue: new BigNumber(_receiveValue).dividedBy(10 ** decimals).toString(),
    actualSend: new BigNumber(_sendValue).dividedBy(10 ** decimals).toString()
  };
}

function safeCode(tradingPair: ITradingPair) {
  const internalId = String(tradingPair.toChain.id).length < 2 ? ("0" + tradingPair.toChain.id) : tradingPair.toChain.id;
  const dealerId = String(tradingPair.dealerId || 0).length < 2 ? ("0" + tradingPair.dealerId) : tradingPair.dealerId;
  return tradingPair.ebcId ?
    dealerId + tradingPair.ebcId + internalId : (9000 + Number(tradingPair.toChain.id) + '');
}

function getTAmountFromRAmount(chainId: number, amount: string, pText: string) {
  if (BigNumber(amount).lt(1)) {
    throw new Error("the token doesn't support that many decimal digits");
  }

  const validDigit = AmountValidDigits(chainId, amount);
  const amountLength = amount.length;
  if (isLimitNumber(chainId) && amountLength > validDigit) {
    return amount.toString().slice(0, validDigit - pText.length) + pText + amount.toString().slice(validDigit);
  } else if (chainId === 9 || chainId === 99) {
    return amount;
  } else {
    return amount.toString().slice(0, amountLength - pText.length) + pText;
  }
}

const MAX_BITS: any = {
  3: 35,
  33: 35,
  8: 28,
  88: 28,
  11: 28,
  511: 28,
  13: 35,
  513: 35,
};

function AmountValidDigits(chainId: number, amount: string) {
  const maxDigit = BigNumber(2 ** (MAX_BITS[chainId] || 256) - 1).toFixed();
  const amountMaxDigits = maxDigit.length;

  const ramount = amount.replace(/^0+(\d)|(\d)0+$/gm, "$1$2");

  if (ramount.length > amountMaxDigits) {
    throw new Error("amount is inValid");
  }
  if (ramount > maxDigit) {
    return amountMaxDigits - 1;
  } else {
    return amountMaxDigits;
  }
}

function isLimitNumber(chainId: number) {
  return chainId === 3 || chainId === 33 || chainId === 8 || chainId === 88 ||
    chainId === 11 || chainId === 511 || chainId === 12 || chainId === 512;
}
