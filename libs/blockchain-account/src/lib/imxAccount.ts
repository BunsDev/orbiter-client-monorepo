import { ethers } from 'ethers';
import {
  ImmutableX,
  Config,
  createStarkSigner,
  generateLegacyStarkPrivateKey,
} from "@imtbl/core-sdk";
import { OrbiterAccount } from "./orbiterAccount";
import { equals, sleep } from "@orbiter-finance/utils";
import { TransactionRequest, TransferResponse } from "./IAccount.interface";
import BigNumber from "bignumber.js";
import { HTTPGet } from '@orbiter-finance/request';
export class IMXAccount extends OrbiterAccount {
  private L1Wallet: ethers.Wallet;
  private client: ImmutableX;

  async connect(privateKey: string, address: string) {
    const chainConfig = this.chainConfig;
    const id = +chainConfig.internalId;
    this.client = new ImmutableX(id === 8 ? Config.PRODUCTION : Config.SANDBOX);
    const network = id === 8 ? "mainnet" : "sepolia";
    const L1Provider = chainConfig.api.key ? new ethers.providers.EtherscanProvider(network, chainConfig.api.key) : new ethers.providers.EtherscanProvider(network);
    this.L1Wallet = new ethers.Wallet(privateKey).connect(L1Provider);
    this.address = address;
    return this;
  }

  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(
      String(this.chainConfig.nativeCurrency.address),
      to,
      value,
      transactionRequest
    );
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    const unsignedTransferRequest: any = {
      type: "",
      receiver: to,
      amount: new BigNumber(new BigNumber(String(value)).dividedBy(100000000).toFixed(0)).multipliedBy(100000000).toString(), // Denominated in wei
    };
    const chainConfig = this.chainConfig
    if (equals(chainConfig.nativeCurrency.address, token)) {
      unsignedTransferRequest.type = "ETH";
    } else {
      unsignedTransferRequest.type = "ERC20";
      unsignedTransferRequest.tokenAddress = token;
    }
    const starkKey = await generateLegacyStarkPrivateKey(this.L1Wallet as any);
    const starkSigner = await createStarkSigner(starkKey);
    const walletConnection: any = { ethSigner: this.L1Wallet, starkSigner };
    const response = await this.client.transfer(
      walletConnection,
      unsignedTransferRequest
    );
    this.chainConfig.debug && this.logger.debug(`transfer response: ${JSON.stringify(response)}`);
    return {
      hash: `${response.transfer_id}`,
      from: this.address,
      to,
      value,
      nonce: 0,
      token,
    };
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    const chainConfig = this.chainConfig;
    if (token && token.toLowerCase() !== chainConfig.nativeCurrency.address.toLowerCase()) {
      return await this.getTokenBalance(token, address);
    } else {
      return await this.getTokenBalance(
        chainConfig.nativeCurrency.address,
        address
      );
    }
  }

  public async getTokenBalance(
    token: string,
    address?: string
  ): Promise<bigint> {
    if (token.toLowerCase() === this.chainConfig.nativeCurrency.address.toLowerCase()) {
      const res: any = await HTTPGet(`${this.chainConfig.api.url}/v1/balances/${address || this.address}`);
      return BigInt(res?.imx || 0);
    }
    let res: any = await HTTPGet(`${this.chainConfig.api.url}/v2/balances/${address || this.address}`);
    const balanceList = res?.result || [];
    const balanceInfo = balanceList.find(item => item.token_address.toLowerCase() === token.toLowerCase());
    return BigInt(balanceInfo?.balance || 0);
  }

  public async waitForTransactionConfirmation(transactionHash: string) {
    transactionHash = transactionHash.replace('imx:', '');
    const response: any = await HTTPGet(`${this.chainConfig.api.url}/v1/transfers/${transactionHash}`);
    if (response?.transaction_id) {
      return { from: response.user, to: response.receiver };
    }
    console.log(`${transactionHash} waitForTransactionConfirmation ...`);
    await sleep(1000);
    return await this.waitForTransactionConfirmation(transactionHash);
  }
}
