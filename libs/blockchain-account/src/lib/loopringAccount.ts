import { ethers } from 'ethers';
import { OrbiterAccount } from './orbiterAccount';
import {
  ExchangeAPI,
  ConnectorNames,
  generateKeyPair,
  UserAPI
} from '../../../../node_modules/@loopring-web/loopring-sdk'

import Web3 from 'web3';
import PrivateKeyProvider from 'truffle-privatekey-provider';
import { HTTPGet } from "@orbiter-finance/utils";
import { sleep } from '@orbiter-finance/utils';
import { LoopringSendTokenRequest, TransferAmountTransaction, TransferResponse } from './IAccount.interface';

export class LoopringAccount extends OrbiterAccount {
  private L1Wallet: ethers.Wallet;
  private client: ExchangeAPI;
  private accountInfo;
  private privateKey;

  async connect(privateKey: string, address: string) {
    this.privateKey = privateKey;
    this.L1Wallet = new ethers.Wallet(privateKey);
    this.address = this.L1Wallet.address;
    this.client = new ExchangeAPI({ chainId: Number(this.chainConfig.networkId) });
    const { accInfo } = await this.client.getAccount({ owner: address });
    if (!accInfo) {
      throw Error('account unlocked');
    }
    this.accountInfo = accInfo;
    return this;
  }

  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: LoopringSendTokenRequest
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      return await this.getTokenBalance(token, address);
    } else {
      return await this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
    }
  }

  public async getTokenBalance(token: string, address?: string): Promise<bigint> {
    address = address || this.L1Wallet.address;
    const tokenInfo = [...this.chainConfig.tokens, this.chainConfig.nativeCurrency]
      .find(item => item.address.toLowerCase() === token.toLowerCase());
    if (!tokenInfo) {
      throw new Error(`${token} token not found`);
    }
    const { accInfo } = await this.client.getAccount({ owner: address });
    const balances: any[] = await HTTPGet(`${this.chainConfig.api.url}/api/v3/user/balances?accountId=${String(accInfo.accountId)}&tokens=${String(tokenInfo.id)}`);
    if (balances.length > 0) {
      return BigInt(balances[0].total);
    }
    return 0n;
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: LoopringSendTokenRequest
  ): Promise<TransferResponse | undefined> {
    const tokenInfo = [...this.chainConfig.tokens, this.chainConfig.nativeCurrency]
      .find(item => item.address.toLowerCase() === token.toLowerCase());
    if (!tokenInfo) {
      throw new Error(`${token} token not found`);
    }
    const userApi = new UserAPI({
      chainId: Number(this.chainConfig.networkId)
    });
    const fromAddress = this.L1Wallet.address;
    const accInfo = this.accountInfo;
    const providerChain = this.chainConfig;
    if (!providerChain || !providerChain.rpc || providerChain.rpc.length <= 0) {
      throw new Error('LoopringAccount not config rpc');
    }
    const provider = new PrivateKeyProvider(this.privateKey, providerChain?.rpc[0]);
    const web3 = new Web3(provider);
    const { exchangeInfo } = await this.client.getExchangeInfo();
    const eddsaKey = await generateKeyPair({
      web3,
      address: accInfo.owner,
      keySeed: accInfo.keySeed,
      walletType: ConnectorNames.Unknown,
      chainId: Number(this.chainConfig.networkId),
    });
    const { apiKey } = await userApi.getUserApiKey(
      {
        accountId: accInfo.accountId,
      },
      eddsaKey.sk
    );
    if (!apiKey) {
      throw Error('Get Loopring ApiKey Error');
    }
    // step 3 get storageId
    const storageId = await userApi.getNextStorageId(
      {
        accountId: accInfo.accountId,
        sellTokenId: Number(tokenInfo.id)
      },
      apiKey
    );
    const sendNonce = storageId.offchainId;
    const ts = Math.round(new Date().getTime() / 1000) + 30 * 86400;
    // step 4 transfer
    const OriginTransferRequestV3 = {
      exchange: exchangeInfo.exchangeAddress,
      payerAddr: fromAddress,
      payerId: accInfo.accountId,
      payeeAddr: to,
      payeeId: 0,
      storageId: sendNonce,
      token: {
        tokenId: tokenInfo.id,
        volume: String(value),
      },
      maxFee: {
        tokenId: transactionRequest?.feeTokenId || 0,
        volume: transactionRequest?.maxFee || '940000000000000',
      },
      validUntil: ts,
      memo: transactionRequest?.memo,
    };
    const transactionResult = await userApi.submitInternalTransfer({
      request: <any>OriginTransferRequestV3,
      web3: web3 as any,
      chainId: Number(this.chainConfig.networkId),
      walletType: ConnectorNames.Unknown,
      eddsaKey: eddsaKey.sk,
      apiKey: apiKey,
      isHWAddr: false,
    });
    this.logger.info('transfer response:', transactionResult);
    if (transactionResult) {
      return {
        hash: transactionResult['hash'],
        to: to,
        from: fromAddress,
        nonce: transactionResult['storageId'],
        token: token,
        data: transactionRequest?.memo,
        value: value,
      };
    }
  }

  public async waitForTransactionConfirmation(transactionHash: string) {
    const response: { totalNum: number, transactions: any[] } = <any>await HTTPGet(`${this.chainConfig.api.url}/api/v3/user/transactions?accountId=${this.accountInfo.accountId}&hashes=${transactionHash}`);
    if (response && response.transactions.length === 1) {
      const res: any = response.transactions[0];
      if (res) {
        return { from: res.receiverAddress, to: res.senderAddress, ...res };
      }
    }
    console.log(`${this.chainConfig.name} ${transactionHash} waitForTransactionConfirmation ...`);
    await sleep(1000);
    return await this.waitForTransactionConfirmation(transactionHash);
  }

  public async pregeneratedRequestParameters(
    orders: TransferAmountTransaction,
    transactionRequest: any = {}
  ) {
    transactionRequest.memo = orders.sourceNonce;
    return transactionRequest;
  }
}
