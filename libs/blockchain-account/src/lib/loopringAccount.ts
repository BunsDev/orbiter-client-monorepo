import { ethers } from 'ethers';
import { OrbiterAccount } from './orbiterAccount';
import {
  ExchangeAPI,
  ConnectorNames,
  generateKeyPair,
  UserAPI
} from '@loopring-web/loopring-sdk'

import Web3 from 'web3';
import PrivateKeyProvider from 'truffle-privatekey-provider';
import { HTTPGet } from "@orbiter-finance/request";
import { sleep } from '@orbiter-finance/utils';
import { LoopringSendTokenRequest, TransactionSendBeforeError, TransferResponse } from './IAccount.interface';
import { NonceManager } from "./nonceManager";

export class LoopringAccount extends OrbiterAccount {
  private L1Wallet: ethers.Wallet;
  private client: ExchangeAPI;
  private accountInfo;
  private privateKey;
  public nonceManager: NonceManager;

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
    if (!this.nonceManager) {
      this.nonceManager = new NonceManager(this.address, async () => {
        return 0;
      });
      await this.nonceManager.forceRefreshNonce();
    }
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
    const balances: any[] = await HTTPGet(`${this.chainConfig.api.url}/user/balances?accountId=${String(accInfo.accountId)}&tokens=${String(tokenInfo.id)}`);
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
      throw new TransactionSendBeforeError(`${token} token not found`);
    }
    const userApi = new UserAPI({
      chainId: Number(this.chainConfig.networkId)
    });
    const fromAddress = this.L1Wallet.address;
    const accInfo = this.accountInfo;
    const providerChain = this.chainConfig;
    if (!providerChain || !providerChain.rpc || providerChain.rpc.length <= 0) {
      throw new TransactionSendBeforeError('LoopringAccount not config rpc');
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
      throw TransactionSendBeforeError('Get Loopring ApiKey Error');
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
    let transactionResult: any;
    const { submit, rollback } = await this.nonceManager.getNextNonce();
    try {
      transactionResult = await userApi.submitInternalTransfer({
        request: <any>OriginTransferRequestV3,
        web3: web3 as any,
        chainId: Number(this.chainConfig.networkId),
        walletType: ConnectorNames.Unknown,
        eddsaKey: eddsaKey.sk,
        apiKey: apiKey,
        isHWAddr: false,
      });
      submit();
    } catch (error: any) {
      rollback();
      this.logger.error(`rollback nonce:${error.message}`);
      throw error;
    }

    this.logger.info(`transfer response: ${JSON.stringify(transactionResult)}`);
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
    const response: { totalNum: number, transactions: any[] } = <any>await HTTPGet(`${this.chainConfig.api.url}/user/transactions?accountId=${this.accountInfo.accountId}&hashes=${transactionHash}`,{
      'x-api-key': this.chainConfig.api.key,
    });
    if (response?.transactions && response.transactions.length === 1) {
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
    orders: any,
    transactionRequest: any = {}
  ) {
    transactionRequest.memo = orders['sourceNonce'];
    return transactionRequest;
  }
}
