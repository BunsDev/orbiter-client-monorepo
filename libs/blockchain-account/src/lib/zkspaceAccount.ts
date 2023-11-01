import { BigNumber } from 'bignumber.js';
import { ethers, Wallet } from 'ethers';
import * as zksync from 'zksync';
import { equals, HTTPPost } from "@orbiter-finance/utils";
import {OrbiterAccount} from './orbiterAccount';
import { HTTPGet } from "@orbiter-finance/utils";
import { sign_musig, private_key_to_pubkey_hash } from 'zksync-crypto';
import { TransactionRequest, TransferResponse, ZKSpaceSendTokenRequest } from './IAccount.interface';
import {NonceManager} from './nonceManager';

export class ZkSpaceAccount extends OrbiterAccount {
  private nonceManager: NonceManager;
  private wallet: Wallet;

  async connect(privateKey: string, address: string) {
    const wallet = new ethers.Wallet(privateKey);
    this.wallet = wallet;
    this.address = wallet.address;
    this.nonceManager = new NonceManager(wallet.address, async () => {
      const account = await this.getAccountInfo();
      const nonce = account["nonce"];
      return Number(nonce);
    });
    this.nonceManager.forceRefreshNonce();
    return this;
  }

  async getAccountInfo() {
    try {
      const L1Wallet = this.wallet;
      const result: any = await HTTPGet(`${this.chainConfig.api.url}/account/${L1Wallet.address}/info`);
      const account = {
        ...result.data
      };
      const msg =
        'Access ZKSwap account.\n\nOnly sign this message for a trusted client!';
      const signature = await L1Wallet.signMessage(msg);
      const seed = ethers.utils.arrayify(signature);
      const key = await zksync.crypto.privateKeyFromSeed(seed);
      if (
        account.pub_key_hash ==
        'sync:0000000000000000000000000000000000000000' || account.id === 0
      ) {
        await this.registerAccount(account, key);
      }
      return { ...account, key, address: L1Wallet.address };
    } catch (error: any) {
      throw new Error(`getAccountInfo error ${error.message}`);
    }
  }

  async registerAccount(accountInfo: any, privateKey: Uint8Array) {
    try {
      const L1Wallet = this.wallet;
      const pubKeyHash = ethers.utils
        .hexlify(private_key_to_pubkey_hash(privateKey))
        .substr(2);

      const hexlifiedAccountId = toHex(accountInfo.id, 4);

      const hexlifiedNonce = toHex(accountInfo.nonce, 4);

      // Don't move here any way and don't format it anyway!!!
      let resgiterMsg = `Register ZKSwap pubkey:

${pubKeyHash}
nonce: ${hexlifiedNonce}
account id: ${hexlifiedAccountId}

Only sign this message for a trusted client!`;
      const registerSignature = await L1Wallet.signMessage(resgiterMsg);
      const result: any = await HTTPPost(`${this.chainConfig.api.url}/tx`, {
        signature: null,
        fastProcessing: null,
        extraParams: null,
        tx: {
          account: L1Wallet.address,
          accountId: accountInfo.id,
          ethSignature: registerSignature,
          newPkHash: `sync:` + pubKeyHash,
          nonce: 0,
          type: 'ChangePubKey',
        },
      }, {
        'zk-account': L1Wallet.address,
      });
      if (result?.success) {
        return result;
      }
      throw new Error(`registerAccount: ${result.error.message}`);
    } catch (error) {
      throw error;
    }
  }

  async getAccountTransferFee() {
    const L1Wallet = this.wallet;
    const result: any = await HTTPGet(`${this.chainConfig.api.url}/account/${L1Wallet.address}/fee`);
    // const ethPrice = await getQuotationPrice("1", "ETH", "USD") || 2000;
    // TODO
    const ethPrice = 2000;
    const gasFee = new BigNumber(result.data.transfer).dividedBy(
      new BigNumber(ethPrice)
    )
    const gasFee_fix = gasFee.decimalPlaces(6, BigNumber.ROUND_UP)
    return Number(gasFee_fix)
  }

  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
  }

  public async getBalance(address?: string, tokenOrId?: string | number | undefined): Promise<bigint> {
    if (tokenOrId !== undefined) {
      return await this.getTokenBalance(tokenOrId, address);
    } else {
      return await this.getTokenBalance(Number(this.chainConfig.nativeCurrency.id), address);
    }
  }

  public async getTokenBalance(tokenOrId: string | number, address?: string): Promise<bigint> {
    const tokenInfo = await this.getTokenByChain(tokenOrId);
    if (!tokenInfo) {
      throw new Error('Token information does not exist');
    }
    address = address || this.address;
    const result: any = await this.getBalances(address);
    if (result?.success && result.data) {
      const balances = result.data.balances.tokens;
      const item = balances.find(row => row.id === tokenInfo.id);
      if (item) {
        const value = new BigNumber(item.amount).multipliedBy(10 ** tokenInfo.decimals);
        return BigInt(value.toString());
      }

    }
    return 0n;
  }

  async getBalances(address: string) {
    return await HTTPGet(`${this.chainConfig.api.url}/account/${address}/balances`);
  }

  async sendTransaction(to: string, transactionRequest: ZKSpaceSendTokenRequest) {
    // prod = 13 goerli = 129 rinkeby = 133
    const account: any = await this.getAccountInfo();
    if (!account) {
      throw new Error('account not found');
    }
    const zksNetworkID = Number(this.chainConfig.internalId) === 12 ? 13 : 129;
    const feeToken = this.getTokenByChain(transactionRequest.feeTokenId);
    if (!feeToken) {
      throw new Error('feeToken not found');
    }
    const sendToken = this.getTokenByChain(transactionRequest.tokenId);
    if (!sendToken) {
      throw new Error('sendToken not found');
    }
    const sendNonce = transactionRequest.nonce || account.nonce;
    const fromAddress = this.wallet.address;
    const sendValue = ethers.BigNumber.from(transactionRequest.value?.toString());
    const sendFee = zksync.utils.closestPackableTransactionFee(
      transactionRequest.fee
    );
    const msgBytes = ethers.utils.concat([
      '0x05',
      zksync.utils.numberToBytesBE(account.id, 4),
      fromAddress,
      to,
      zksync.utils.numberToBytesBE(Number(sendToken.id), 2),
      zksync.utils.packAmountChecked(sendValue),
      zksync.utils.numberToBytesBE(Number(feeToken.id), 1),
      zksync.utils.packFeeChecked(sendFee),
      zksync.utils.numberToBytesBE(zksNetworkID, 1),
      zksync.utils.numberToBytesBE(sendNonce, 4),
    ]);
    const signaturePacked = sign_musig(account.key, msgBytes);
    const pubKey = ethers.utils
      .hexlify(signaturePacked.slice(0, 32))
      .substr(2);
    const l2Signature = ethers.utils
      .hexlify(signaturePacked.slice(32))
      .substr(2);
    const l2Msg =
      `Transfer ${new BigNumber(sendValue.toString()).dividedBy(10 ** sendToken.decimals)} ${sendToken.symbol}\n` +
      `To: ${to.toLowerCase()}\n` +
      `Chain Id: ${zksNetworkID}\n` +
      `Nonce: ${sendNonce}\n` +
      `Fee: ${new BigNumber(sendFee.toString()).dividedBy(10 ** feeToken.decimals)} ${feeToken.symbol}\n` +
      `Account Id: ${account.id}`;
    const ethSignature = await this.wallet.signMessage(l2Msg);
    const tx = {
      type: 'Transfer',
      accountId: account.id,
      from: fromAddress,
      to: to,
      token: sendToken.id,
      amount: sendValue.toString(),
      feeToken: feeToken.id,
      fee: sendFee.toString(),
      chainId: zksNetworkID,
      nonce: sendNonce,
      signature: {
        pubKey: pubKey,
        signature: l2Signature,
      },
    };
    const result: any = await HTTPPost(`${this.chainConfig.api.url}/tx`, {
      tx,
      signature: {
        type: 'EthereumSignature',
        signature: ethSignature,
      },
      fastProcessing: false
    });
    if (!result?.success) {
      throw new Error(`post ethereumSignature fail: ${result?.error?.message}`);
    }
    return {
      from: fromAddress,
      to,
      hash: `0x${result["data"].substr(8)}`,
      nonce: sendNonce,
      value: BigInt(sendValue.toString()),
      fee: BigInt(sendFee.toString()),
      token: sendToken.address
    };
  }

  public async transferToken(
    tokenOrId: string | number,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    const tokenInfo = this.getTokenByChain(tokenOrId);
    if (!tokenInfo) {
      throw new Error('Token information does not exist');
    }
    let feeNum = await this.getAccountTransferFee();
    const transferValue =
      zksync.utils.closestPackableTransactionAmount(String(value));
    const feeTokenId = 0;
    // TODO:fix goerli fee  error Incorrect calculation of fee
    if (Number(this.chainConfig.internalId) === 512) {
      feeNum = feeNum * 12;
    }
    // feeNum = 0.0012;
    const fee = ethers.BigNumber.from(new BigNumber(feeNum).multipliedBy(10 ** 18).toFixed(0));
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    try {
      const response = await this.sendTransaction(to, {
        feeTokenId,
        tokenId: Number(tokenInfo.id),
        nonce,
        fee: BigInt(fee.toString()),
        value: BigInt(transferValue.toString())
      });
      this.logger.log('transfer response:', response);
      submit();
      return response as TransferResponse;
    } catch (error) {
      this.logger.error(`${this.chainConfig.name} sendTransaction error`, error);
      rollback();
    }

  }

  getTokenByChain(tokenOrId: string | number) {
    const chainConfig = this.chainConfig;
    return equals(chainConfig.nativeCurrency.address, String(tokenOrId)) ?
      chainConfig.nativeCurrency :
      chainConfig.tokens.find((t) => equals(t.address, String(tokenOrId)));
  }
}

export function toHex(num: number, length: number) {
  const charArray = ['a', 'b', 'c', 'd', 'e', 'f'];
  const strArr = Array(length * 2).fill('0');
  let i = length * 2 - 1;
  while (num > 15) {
    var yushu = num % 16;
    if (yushu >= 10) {
      let index = yushu % 10;
      strArr[i--] = charArray[index];
    } else {
      strArr[i--] = yushu.toString();
    }
    num = Math.floor(num / 16);
  }

  if (num != 0) {
    if (num >= 10) {
      let index = num % 10;
      strArr[i--] = charArray[index];
    } else {
      strArr[i--] = num.toString();
    }
  }
  strArr.unshift('0x');
  return strArr.join('');
}