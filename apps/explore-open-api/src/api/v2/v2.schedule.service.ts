import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChainConfigService, MakerV1RuleService } from '@orbiter-finance/config';
import { V2Service } from "./v2.service";
import { ITradingPair } from "../api.interface";
import { sleep } from "@orbiter-finance/utils";
import { INetState } from "../../../../../libs/v1-seq-models/src";

@Injectable()
export class V2Schedule {
  constructor(private v2Service: V2Service, private chainConfigService: ChainConfigService, private makerV1RuleService: MakerV1RuleService) {
    new Promise(async () => {
      await sleep(1000);
      await this.updateConfig();
    });
  }

  @Cron('* */1 * * * *')
  private async updateConfig() {
    const chainList = this.chainConfigService.getAllChains();
    V2Service.chainList = chainList;
    chainList.forEach(item => {
      V2Service.idMap[+item.internalId] = item.chainId;
    });

    const rules: {
      makerAddress: string,
      sender: string,
      gasFee: number,
      tradingFee: number,
      originWithholdingFee: number,
      maxPrice: number,
      minPrice: number,
      slippage: number,
      startTime: number,
      endTime: number,
      chain: string,
      token: string,
      sourceChainId: string,
      targetChainId: string,
      sourceSymbol: string,
      targetSymbol: string
    }[] = <any[]>this.makerV1RuleService.getAll();
    let tradingPairs: ITradingPair[] = [];
    const isMainNet = chainList.find(item => +item.internalId === 1);
    for (const rule of rules) {
      const [fromChainId, toChainId] = rule.chain.split('-');
      const [fromSymbol, toSymbol] = rule.token.split('-');
      const offline = [12, 13];
      if (offline.includes(+fromChainId) || offline.includes(+toChainId)) {
        continue;
      }
      const fromChainInfo = chainList.find(item => +item.internalId === +fromChainId);
      const toChainInfo = chainList.find(item => +item.internalId === +toChainId);
      if (!fromChainInfo) {
        if (isMainNet) console.error(`${fromChainId} not configured`, rule.chain);
        continue;
      }
      if (!toChainInfo) {
        if (isMainNet) console.error(`${toChainId} not configured`, rule.chain);
        continue;
      }
      const fromToken = [fromChainInfo.nativeCurrency, ...fromChainInfo.tokens].find(item => item.symbol === fromSymbol);
      const toToken = [toChainInfo.nativeCurrency, ...toChainInfo.tokens].find(item => item.symbol === toSymbol);
      if (!fromToken) {
        if (isMainNet) console.error(`${fromSymbol} not configured`, rule.token);
        continue;
      }
      if (!toToken) {
        if (isMainNet) console.error(`${toSymbol} not configured`, rule.token);
        continue;
      }
      const sendType = (fromSymbol === toSymbol && !([4, 44].includes(+fromChainId) || [4, 44].includes(+toChainId))) ? 1 : 2;
      tradingPairs.push({
        pairId: `${fromChainInfo.chainId}-${toChainInfo.chainId}:${rule.token}`,
        recipient: String(rule.makerAddress).toLowerCase(),
        sender: String(rule.sender).toLowerCase(),
        gasFee: String(rule.gasFee),
        tradingFee: String(rule.tradingFee),
        slippage: Number(rule.slippage || 50),
        originWithholdingFee: String(rule.originWithholdingFee || ''),
        sendType,
        fromChain: {
          id: +fromChainId,
          chainId: fromChainInfo.chainId,
          networkId: fromChainInfo.networkId,
          name: fromChainInfo.name,
          symbol: fromSymbol,
          tokenAddress: fromToken.address,
          decimals: fromToken.decimals,
          maxPrice: rule.maxPrice,
          minPrice: rule.minPrice
        },
        toChain: {
          id: +toChainId,
          chainId: toChainInfo.chainId,
          networkId: toChainInfo.networkId,
          name: toChainInfo.name,
          symbol: toSymbol,
          decimals: toToken.decimals,
          tokenAddress: toToken.address
        },
      });
    }
    const netStateList: INetState[] = await this.v2Service.getOffline();
    if (netStateList && netStateList.length) {
      tradingPairs = tradingPairs.filter(item => {
          return !netStateList.find(net =>
            (
              (
                net.source === +item.fromChain.id &&
                (net.sourceToken === item.fromChain.symbol || !net.sourceToken)
              )
              || !net.source) &&
            (
              (
                net.dest === +item.toChain.id &&
                (net.destToken === item.toChain.symbol || !net.destToken)
              )
              || !net.dest
            )
          );
        },
      );
    }
    if (JSON.stringify(V2Service.tradingPairs) !== JSON.stringify(tradingPairs)) {
      V2Service.updateTime = new Date().valueOf();
      console.log(new Date().toLocaleTimeString(), 'tradingPairs update, current count: ', tradingPairs.length,
        'rules count: ', rules.length, 'chainList count: ', chainList.length);
    }
    V2Service.tradingPairs = tradingPairs;
  }
}
