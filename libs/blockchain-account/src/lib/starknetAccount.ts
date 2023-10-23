import { Account, Contract, cairo, RpcProvider } from 'starknet';
import { equals, sleep } from '@orbiter-finance/utils';
import { NonceManager } from "@orbiter-finance/utils";
import { TransactionRequest, TransferResponse } from "./IAccount.interface";
import { OrbiterAccount } from "./orbiterAccount";
import { ERC20Abi, StarknetERC20 } from "../../../utils/src/lib/abi";

export default class StarknetAccount extends OrbiterAccount {
  public account: Account;
  public provider: RpcProvider;
  private nonceManager: NonceManager;

  async connect(privateKey: string, address: string, version: string) {
    const provider = this.getProviderV4();
    const account = new Account(
      provider,
      address,
      privateKey,
      <any>version || "0"
    );
    if (!equals(account.address, address)) {
      throw new Error('The connected wallet address is inconsistent with the private key address');
    }
    this.account = account;
    if (!this.nonceManager) {
      this.nonceManager = new NonceManager(address, async () => {
        const nonce = await this.account.getNonce();
        return Number(nonce);
      });
      await this.nonceManager.forceRefreshNonce();
    }
    return this;
  }

  public getProviderV4() {
    this.provider = this.provider || new RpcProvider({ nodeUrl: this.chainConfig.rpc[0] });
    return this.provider;
  }

  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(this.chainConfig.nativeCurrency.address, to, value, transactionRequest);
  }

  public async transfers(
    tos: string[],
    values: bigint[],
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    return await this.transferTokens(this.chainConfig.nativeCurrency.address, tos, values, transactionRequest);
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse | undefined> {
    return await this.transferTokens(token, [to], [value], transactionRequest);
  }

  public async transferTokens(
    token: string,
    tos: string[],
    values: bigint[],
    transactionRequest: TransactionRequest = {}
  ): Promise<any> {
    const provider = this.getProviderV4();
    const invocationList: any[] = [];
    for (let i = 0; i < tos.length; i++) {
      const recipient = tos[i];
      const amount = values[i];
      const ethContract = new Contract(ERC20Abi, token, provider);
      invocationList.push(ethContract.populateTransaction.transfer(recipient, cairo.uint256(amount)));
    }
    const { nonce, submit } = await this.nonceManager.getNextNonce();
    if (!nonce && nonce != 0) {
      throw new Error('Not Find Nonce Params');
    }
    const transactionDetail = {
      nonce: nonce,
      maxFee: BigInt(0.009 * 10 ** 18)
    };
    try {
      const suggestedMaxFee = await this.account.getSuggestedMaxFee(
        {
          type: "INVOKE_FUNCTION",
          payload: invocationList
        } as any,
        transactionDetail
      );
      if (suggestedMaxFee > transactionDetail.maxFee) {
        transactionDetail.maxFee = suggestedMaxFee;
      }
    } catch (error: any) {
      if (error.message.indexOf('Invalid transaction nonce. Expected:') !== -1
        && error.message.indexOf('got:') !== -1) {
        const arr: string[] = error.message.split(', got: ');
        const nonce1 = arr[0].replace(/[^0-9]/g, "");
        const nonce2 = arr[1].replace(/[^0-9]/g, "");
        this.logger.error(`starknet signTransfer error: ${nonce} != ${nonce1}, ${nonce} != ${nonce2}`);
      } else if (error.message.indexOf('ContractAddress(PatriciaKey(StarkFelt') !== -1 &&
        error.message.indexOf('Expected: Nonce(StarkFelt') !== -1) {
        this.logger.error(`starknet signTransfer error: ${error.message}`);
      } else {
        throw new Error(error.message);
      }
    }

    // accessLogger.info(`transactionDetail: ${JSON.stringify(transactionDetail)}`);
    const trx = await this.account.execute(invocationList, <any>null, transactionDetail);
    submit();
    if (!trx || !trx.transaction_hash) {
      throw new Error(`Starknet Failed to send transaction hash does not exist`);
    }
    await sleep(1000);
    const hash = trx.transaction_hash;
    return {
      hash: hash,
      from: this.account.address,
      // to: tos.join(','),
      // value: BigInt(value),
      fee: BigInt(transactionDetail.maxFee),
      nonce: nonce,
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
    if (address && address != this.address) {
      throw new Error('The specified address query is not supported temporarily');
    }
    const provider = this.getProviderV4();
    const contractInstance = new Contract(
      <any>StarknetERC20,
      token,
      provider,
    );
    const balanceResult = (await contractInstance.balanceOf(address)).balance;
    return BigInt(balanceResult.low.toString());
  }

  public async waitForTransactionConfirmation(transactionHash: string) {
    const provider = this.getProviderV4();
    try {
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (receipt) {
        return receipt;
      }
    } catch (e) {
      this.logger.error(`waitForTransactionConfirmation error ${e.message}`);
    }
    await sleep(3000);
    console.log(`starknet ${transactionHash} waitForTransactionConfirmation ...`);
    return await this.waitForTransactionConfirmation(transactionHash);
  }
}
