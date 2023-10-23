import {OrbiterAccount} from './orbiterAccount';
import { HTTPGet, NonceManager } from "@orbiter-finance/utils";
import { ethers } from 'ethers';
import * as zksync from 'zksync';
import { AbstractWallet } from "zksync/build/abstract-wallet";
import { TransactionRequest,TransferResponse } from './IAccount.interface';

export class ZkSyncAccount extends OrbiterAccount  {
    public account: AbstractWallet;
    private nonceManager: NonceManager;
    async connect(privateKey: string, address:string) {
      const l1Wallet = new ethers.Wallet(privateKey);
      const wallet  = await this.getL2Wallet(privateKey);
      this.account = wallet;
      this.address = wallet.address();
      if (!this.nonceManager) {
        this.nonceManager = new NonceManager(l1Wallet.address, async () => {
          const nonce = await wallet.getNonce("committed");
          return Number(nonce);
        });
        await this.nonceManager.forceRefreshNonce();
      }
      return this;
    }
  private async getL2Wallet(privateKey) {
    let l1Provider;
    let l2Provider;
    if (this.chainId === 'zksync') {
      l1Provider = ethers.providers.getDefaultProvider('mainnet');
      l2Provider = await zksync.getDefaultProvider('mainnet');
    } else if (this.chainId === 'zksync_test') {
      l1Provider = ethers.providers.getDefaultProvider("goerli");
      l2Provider = await zksync.Provider.newHttpProvider("https://goerli-api.zksync.io/jsrpc");
    }
    const l1Wallet = new ethers.Wallet(privateKey).connect(l1Provider);
    return await zksync.Wallet.fromEthSigner(
      l1Wallet,
      l2Provider
    );
  }
  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
  }
  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    const amount = zksync.utils.closestPackableTransactionAmount(String(value));
    let response;
    try {
      response = await this.account.syncTransfer({
        to,
        token,
        nonce,
        amount,
      });
      this.logger.info(`transfer response: ${JSON.stringify(response)}`);
      submit();
    } catch (error: any) {
      this.logger.error(`rollback nonce:${error.message}`);
      rollback();
      throw error;
    }
    if (response) {
      response.awaitReceipt().then(tx => {
        this.logger.info(`${this.chainConfig.name} sendTransaction waitForTransaction: ${JSON.stringify(tx)}`);
      }).catch(err => {
        this.logger.error(`${this.chainConfig.name} sendTransaction Error:`, err);
        if (err && err.message.includes('Nonce mismatch')) {
          this.nonceManager.forceRefreshNonce();
        }
      });
    }
    const txData = response.txData.tx;
    return {
      hash: response.txHash.replace('sync-tx:', '0x'),
      from: this.account.address(),
      to,
      fee: BigInt(txData.fee),
      value: BigInt(value),
      nonce: txData.nonce,
      token
    };
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      return this.getTokenBalance(token, address);
    } else {
      return this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
    }
  }
  public async getTokenBalance(token: string, address?: string): Promise<bigint> {
    if (address && address.toLowerCase() != this.address.toLowerCase()) {
      throw new Error(`The specified address query is not supported temporarily ${address} - ${this.address}`);
    }
    return BigInt((await this.account.getBalance(token, 'committed')).toString());
  }

  public async waitForTransactionConfirmation(transactionHash: string) {
    const response = await HTTPGet(`${this.chainConfig.api.url}/transactions/${transactionHash}/data`);
    if (response && response['status'] === 'success') {
      const res = response['result'];
      if (res) {
        return { ...res.tx, ...res.tx.op };
      }
    }
    console.log(`${transactionHash} waitForTransactionConfirmation ...`);
    return await this.waitForTransactionConfirmation(transactionHash);
  }
}
