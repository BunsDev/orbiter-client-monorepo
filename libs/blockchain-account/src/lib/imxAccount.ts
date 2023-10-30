import { ethers } from "ethers6";
import {
  ImmutableX,
  Config,
  createStarkSigner,
  generateLegacyStarkPrivateKey,
} from "@imtbl/core-sdk";
import {OrbiterAccount} from "./orbiterAccount";
import { equals, HTTPGet, sleep } from "@orbiter-finance/utils";
import { TransactionRequest, TransferResponse } from "./IAccount.interface";
export class IMXAccount extends OrbiterAccount {
  private L1Wallet: ethers.Wallet;
  private readonly client: ImmutableX;

  async connect(privateKey: string) {
    const chainConfig = this.chainConfig;
    const id = +chainConfig.internalId;
    this.client = new ImmutableX(id === 8 ? Config.PRODUCTION : Config.SANDBOX);
    const L1Provider = ethers.getDefaultProvider(
      id === 8 ? "mainnet" : "goerli"
    );
    this.L1Wallet = new ethers.Wallet(privateKey).connect(L1Provider);
    this.address = this.L1Wallet.address;
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
      amount: value, // Denominated in wei
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
    this.logger.debug("transfer response:", response);
    return {
      hash: String(response.transfer_id),
      from: this.L1Wallet.address,
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
      const res = await HTTPGet(`${this.chainConfig.api}/v1/balances/${address || this.L1Wallet.address}`);
      return BigInt(res?.imx || 0);
    }
    let res: any = await HTTPGet(`${this.chainConfig.api}/v2/balances/${address || this.L1Wallet.address}`);
    const balanceList = res?.result || [];
    const balanceInfo = balanceList.find(item => item.token_address.toLowerCase() === token.toLowerCase());
    return BigInt(balanceInfo?.balance || 0);
  }

  public async waitForTransactionConfirmation(transactionHash: string) {
    const response = await HTTPGet(`${this.chainConfig.api.url}/v1/transfers/${transactionHash}`);
    if (response?.transaction_id) {
      return { from: response.user, to: response.receiver };
    }
    console.log(`${transactionHash} waitForTransactionConfirmation ...`);
    await sleep(1000);
    return await this.waitForTransactionConfirmation(transactionHash);
  }
}
