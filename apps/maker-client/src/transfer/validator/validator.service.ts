import { Injectable, Logger } from "@nestjs/common";
import dayjs from "dayjs";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { ConfigService } from "@nestjs/config";
import { isEmpty } from "@orbiter-finance/utils";
import { ChainLinkService } from "../../service/chainlink.service";
import { type TransferAmountTransaction } from "../sequencer/sequencer.interface";
import { AccountFactoryService } from "../../factory";
import { groupBy, take, uniq } from "lodash";
import { PrivateKeyService } from "../../service/privatekey.service";
import { OrbiterAccount } from "@orbiter-finance/blockchain-account";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";

@Injectable()
export class ValidatorService {
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly envConfig: ENVConfigService,
    private readonly chainLinkService: ChainLinkService,
    private readonly configService: ConfigService,
    private readonly accountFactoryService: AccountFactoryService
  ) { }

  public getTransferGlobalTimeout() {
    return this.envConfig.get("TransferTimeout", 10);
  }
  public getPaidTransferCount(chainId:string) {
    const chainPaidTransferCount = this.envConfig.get<number>(`${chainId}.PaidTransferCount`, 1);
    return +chainPaidTransferCount;
  }
  public async validDisabledPaid(chainId:string) {
    const disabledPaid = this.envConfig.get<boolean>(`${chainId}.DisabledPaid`, false);
    if (disabledPaid == true) {
      return true;
    }
    const globalDisabledPaid = this.envConfig.get<boolean>(`DisabledPaid`, false);
    if (globalDisabledPaid ==true) {
      return true;
    }
    return false;
  }
  public async validDisabledSourceAddress(sourceAddress: string) {
    const disabledSourceAddress: string = await this.envConfig.getAsync('DisabledSourceAddress') || '';
    const disabledAddressList = disabledSourceAddress.replace(/' '/g, '').split(',');
    return !!disabledAddressList.find(item => item.toLowerCase() === sourceAddress.toLowerCase());
  }
  public transactionTimeValid(chainId: string, timestamp: Date) {
    const timeoutMin = Math.floor((Date.now() - dayjs(timestamp).valueOf()) / 1000 / 60);
    const defaultTimeout = this.getTransferGlobalTimeout();
    const transferTimeout = +(this.envConfig.get<Number>(`${chainId}.TransferTimeout`, defaultTimeout));
    if (timeoutMin >= transferTimeout) {
      return true;
    }
    return false;
  }

  public optimisticCheckTxStatus(hash: string, chainId: string) {

    return true
  }
  public async checkMakerInscriptionFluidity(protocol:string,tick:string, total:number) {
    return true;
  }
  public async checkMakerFluidity(chainId:string, wallet:string, token:string, minAmount:number):Promise<boolean>{
    const account = await this.accountFactoryService.createMakerAccount(
      wallet,
      chainId
    ).connect(this.getSenderPrivateKey(wallet), wallet);
    const targetToken = this.chainConfigService.getTokenByChain(chainId, token);
    // const value = new BigNumber(+amount * 10 **targetToken.decimals).toFixed(0);
    const balance = await account.getBalance(wallet, token);
    if (!balance) {
      console.error(`${chainId} ${token} ${wallet} getBalance fail ${balance}`)
      return false;
    }
    const balanceEther = new BigNumber(balance.toString()).div(10**targetToken.decimals).toNumber();
    if (new BigNumber(balanceEther).lte(minAmount)) {
      throw new Errors.InsufficientLiquidity(`checkMakerFluidity ${minAmount}/${balanceEther} ${targetToken.symbol}`);
    }
    return true;
  }
  public async checkMakerPrivateKey(bridgeTx: BridgeTransactionModel):Promise<Array<any>> {
    const result = [];
    for (const addr of bridgeTx.responseMaker) {
        const privateKey  = this.getSenderPrivateKey(addr);
        if (privateKey) {
          result.push({
            address: addr,
            key: privateKey
          })
        }
    }
    return result;
  }


  public getSenderPrivateKey(from: string) {
    from = from.toLocaleLowerCase();
    if (PrivateKeyService.InjectedPrivateKey[from]) return PrivateKeyService.InjectedPrivateKey[from];
    const privateKey =
      process.env[from] ||
      this.configService.get[from];
    if (!privateKey) {
      return this.envConfig.get(from);
    }
    return privateKey;
  }

  public async validatingValueMatches(
    sourceSymbol: string,
    sourceAmount: string,
    targetSymbol: string,
    targetAmount: string
  ) {
    const sourceAmountValue = await this.chainLinkService.getChainLinkPrice(
      sourceAmount,
      sourceSymbol,
      "usd"
    );
    const targetAmountValue = await this.chainLinkService.getChainLinkPrice(
      targetAmount,
      targetSymbol,
      "usd"
    );
    const diffRate = targetAmountValue.div(sourceAmountValue).times(100);
    const riskRatio = Number(this.envConfig.get("riskRatio") || 101);
    if (diffRate.gte(riskRatio)) {
      return false;
      // throw new Error(`validatingValueMatches Trading with loss and risk ${sourceAmount}-${sourceSymbol} To ${targetAmount}-${targetSymbol}`)
    }
    return true;
  }
}
