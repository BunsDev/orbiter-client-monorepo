import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import {
  ChainConfigService,
  IChainConfig,
  MakerV1RuleService
} from "@orbiter-finance/config";
import { ECode, ITradingPair } from "../api.interface";
import Keyv from 'keyv';
import { InjectModel } from "@nestjs/sequelize";
import {
  Transaction,
  ITransaction,
  UserHistory,
  IUserHistory,
  MakerTransaction,
  INetState,
  NetState
} from "@orbiter-finance/v1-seq-models";
import { IMakerConfig, IMakerDataConfig } from "./v2.interface";

const keyv = new Keyv();

const defaultCacheTime = 1000 * 60 * 60;

@Injectable()
export class V2Service {
  static tradingPairs:ITradingPair[] = [];
  static idMap = {};

  constructor(private chainConfigService: ChainConfigService, private makerV1RuleService: MakerV1RuleService) {
    const _this = this;
    // TODO: reomve
    // v1MakerConfigService.init(async function (makerConfig) {
    //   V2Service.tradingPairs = _this.convertMakerConfig(chainList, makerConfig);
    // });
    const chainList = chainConfigService.getAllChains();
    chainList.forEach(item => {
      V2Service.idMap[+item.internalId] = item.chainId;
    });
  }

  @InjectModel(Transaction) private TransactionModel: typeof Transaction;
  @InjectModel(UserHistory) private UserHistoryModel: typeof UserHistory;
  @InjectModel(MakerTransaction) private MakerTransactionModel: typeof MakerTransaction;
  @InjectModel(NetState) private NetStateModel: typeof NetState;

  async getTradingPairs() {
    const netStateList = await this.getOffline();
    if (netStateList && netStateList.length) {
      return V2Service.tradingPairs.filter(item => {
          return !netStateList.find(net => (net.source === item.fromChain.id || !net.source) &&
            (net.dest === item.toChain.id || !net.dest));
        },
      );
    }
    return V2Service.tradingPairs;
  }

  async getTransactionByHash(params: string[]) {
    if (!params || !(params instanceof Array) || params.length < 1) {
      throw new Error("Invalid params");
    }
    return await this.searchByHash(params[0]);
  }

  private async searchByHash(hash) {
    let fromTx: ITransaction = await keyv.get(`${hash}_fromTx`);
    let inId: number = fromTx?.id;
    if (!inId) {
      fromTx = await this.TransactionModel.findOne(<any>{
        attributes: ["id", "side", "status", "timestamp", "hash", "chainId", "value", "symbol"],
        where: { hash },
        raw: true,
      });
      inId = fromTx?.id;
      if (!inId)
        return {
          status: -1,
          txList: [],
        };
      if (fromTx) {
        fromTx.chainId = V2Service.idMap[fromTx.chainId];
        await keyv.set(`${hash}_fromTx`, fromTx, defaultCacheTime);
      }
    }

    let outId = await keyv.get(`${hash}_outId`);
    if (!outId) {
      const makerTransaction = await this.MakerTransactionModel.findOne(<any>{
        attributes: ["outId"],
        where: { inId },
        raw: true,
      });
      outId = makerTransaction?.outId;
      if (!outId) {
        return {
          status: 0,
          txList: [fromTx],
        };
      }
      if (outId) await keyv.set(`${hash}_outId`, outId, defaultCacheTime);
    }

    let toTx: ITransaction = await keyv.get(`${hash}_toTx`);
    if (!toTx) {
      toTx = await Transaction.findOne(<any>{
        attributes: ["side", "status", "timestamp", "hash", "chainId", "value", "symbol"],
        where: { id: outId },
        raw: true,
      });
      if (toTx) {
        toTx.chainId = V2Service.idMap[toTx.chainId];
        await keyv.set(`${hash}_toTx`, toTx, defaultCacheTime);
      }
    }

    const txList = toTx ? [fromTx, toTx] : [fromTx];
    let status = 0;
    if (txList.length === 1) {
      status = 0;
    }
    if (txList.length === 2) {
      status = 1;
      if (toTx?.status == 99) {
        status = 99;
      }
    }
    return { status, txList };
  }

  async getOffline() {
    const cache = await keyv.get('net_state');
    if (cache) {
      return cache;
    }
    const result: INetState[] = await this.NetStateModel.findAll(<any>{
      attributes: ['source', 'dest'],
      raw: true,
    });
    await keyv.set('net_state', result, 1000 * 10);
    return result;
  }

  async collectUserTransaction(params: string[]) {
    if (!params || !(params instanceof Array) || params.length < 2) {
      throw new Error('Invalid params');
    }
    const fromHash = params[0];
    const fromChain = String(params[1]);
    const chainInfo = this.chainConfigService.getChainInfo(fromChain);
    if (!chainInfo?.internalId) {
      return { code: ECode.Fail, msg: 'from chain error' };
    }
    const internalId = +chainInfo.internalId;
    if (internalId === 4 || internalId === 44) {
      // starknet
    } else if (internalId === 8 || internalId === 88) {
      if (!Number(fromHash)) {
        return { code: ECode.Fail, msg: 'hash format error' };
      }
    } else {
      const prefix = fromHash.substr(0, 2);
      if (prefix != '0x') {
        return { code: ECode.Fail, msg: 'hash format error' };
      }
      if (fromHash.length !== 66) {
        return { code: ECode.Fail, msg: 'hash length error' };
      }
    }
    const cache = await keyv.get(`googleapis_${fromHash}`);
    if (cache) {
      return { code: ECode.Success, msg: 'TX Exist' };
    }
    await addRow(fromHash, fromChain, '', String(new Date()));
    await keyv.set(`googleapis_${fromHash}`, 1, defaultCacheTime);
  }

  async getTransactionByAddress(address: string) {
    const cache = await keyv.get(`${address}_history`);
    if (cache) return cache;
    const dataList: IUserHistory[] = [...await this.UserHistoryModel.findAll({
      attributes: ["fromHash", "toHash", "fromTime", "toTime", "fromChain", "toChain", "fromAmount", "fromToken", "toToken", "toAmount", "replySender", "replyAccount"],
      where: {
        replySender: address
      }
    }), ...await this.UserHistoryModel.findAll({
      attributes: ["fromHash", "toHash", "fromTime", "toTime", "fromChain", "toChain", "fromAmount", "fromToken", "toToken", "toAmount", "replySender", "replyAccount"],
      where: {
        replyAccount: address
      }
    })];

    let list = [];
    for (const data of dataList) {
      let decimals = 18;
      if (data.fromToken === 'USDT' || data.fromToken === 'USDC') {
        decimals = 6;
      }
      list.push({
        fromInternalId: data.fromChain,
        toInternalId: data.toChain,
        fromChainId: V2Service.idMap[+data.fromChain],
        toChainId: V2Service.idMap[+data.toChain],
        fromHash: data.fromHash,
        toHash: data.toHash,
        fromSymbol: data.fromToken,
        fromTimestamp: data.fromTime,
        toTimestamp: data.toTime,
        fromValue: new BigNumber(data.fromAmount).dividedBy(10 ** decimals),
        toValue: new BigNumber(data.toAmount).dividedBy(10 ** decimals),
        status: 99,
        isV2: true,
      });
    }
    list = list.sort(function (a, b) {
      return new Date(b.fromTimestamp).valueOf() - new Date(a.fromTimestamp).valueOf();
    });
    await keyv.set(`${address}_history`, list, 1000 * 10);
    return list;
  }

  convertMakerConfig(chainList: IChainConfig[], makerConfig: IMakerConfig): ITradingPair[] {
    const configs: ITradingPair[] = [];
    for (const makerAddress in makerConfig) {
      const makerMap = makerConfig[makerAddress];
      for (const chainIdPair in makerMap) {
        if (!makerMap.hasOwnProperty(chainIdPair)) continue;
        const symbolPairMap = makerMap[chainIdPair];
        const [fromChainId, toChainId] = chainIdPair.split("-");
        const c1Chain = chainList.find(item => +item.internalId === +fromChainId);
        const c2Chain = chainList.find(item => +item.internalId === +toChainId);
        if (!c1Chain || !c2Chain) continue;
        for (const symbolPair in symbolPairMap) {
          if (!symbolPairMap.hasOwnProperty(symbolPair)) continue;
          const makerData: IMakerDataConfig = symbolPairMap[symbolPair];
          const [fromChainSymbol, toChainSymbol] = symbolPair.split("-");
          const fromToken = this.chainConfigService.getTokenBySymbol(+fromChainId, fromChainSymbol);
          const toToken = this.chainConfigService.getTokenBySymbol(+toChainId, toChainSymbol);
          if (!fromToken || !toToken) continue;
          // verify xvm
          if (fromToken.symbol !== toToken.symbol && (!c1Chain.xvmList || !c1Chain.xvmList.length)) {
            console.log(
              `${c1Chain.internalId}-${fromToken.symbol}:${c2Chain.internalId}-${toToken.symbol} not support xvm`,
            );
          }
          const isMainCoin = fromToken.symbol === c1Chain.nativeCurrency.symbol ? 1 : 0;
          // handle makerConfigs
          configs.push({
            id: `${fromChainId}-${toChainId}:${fromChainSymbol}-${toChainSymbol}`,
            recipient: String(makerAddress).toLowerCase(),
            sender: (makerData.sender || makerData.makerAddress).toLowerCase(),
            tradingFee: makerData.tradingFee,
            gasFee: makerData.gasFee,
            fromChain: {
              id: +fromChainId,
              networkId: Number(c1Chain.networkId) || undefined,
              name: c1Chain.name,
              tokenAddress: fromToken.address,
              contractAddress:
                c1Chain.contracts && c1Chain.contracts.length ? c1Chain.contracts[0] : undefined,
              symbol: fromChainSymbol,
              decimals: fromToken.decimals,
              minPrice: makerData.minPrice,
              maxPrice: makerData.maxPrice,
              isMainCoin,
            },
            toChain: {
              id: +toChainId,
              networkId: Number(c2Chain.networkId) || undefined,
              name: c2Chain.name,
              tokenAddress: toToken.address,
              symbol: toChainSymbol,
              decimals: toToken.decimals,
            }
          });
        }
      }
    }
    return configs;
  }
}

const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
  keyFile: "/app/google/sheet-377710-b8d7c8d145e9.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

async function addRow(hash: string, fromChain: string, ip: string, date: string) {
  const spreadsheetId = "1OpKf3BBnjLuySyauzduIroV5ncs4XyO--TaI5lVKGXQ";
  const range = "A1:D1";
  const values = [[hash, fromChain, ip, date]];
  const resource = { values };

  try {
    const { data } = await sheets.spreadsheets.values.append({
      auth,
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      resource,
    });

    console.log(`${data.updates.updatedCells} cells appended.`);
  } catch (e) {
    console.error(e.message);
  }
}
