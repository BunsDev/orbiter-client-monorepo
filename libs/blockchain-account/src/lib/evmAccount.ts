import {
  ethers,
  Interface,
  isError,
  keccak256,
  Network,
  JsonRpcProvider,
  type Wallet,
} from "ethers6";
import { NonceManager } from './nonceManager';
import { ERC20Abi, OrbiterRouterV3 } from '@orbiter-finance/abi'
import {
  Context,
} from "./IAccount";
import { OrbiterAccount } from "./orbiterAccount";
import BigNumber from "bignumber.js";
import {
  TransactionFailedError,
  TransactionRequest,
  TransactionResponse,
  TransactionSendConfirmFail,
  TransferResponse,
} from "./IAccount.interface";
import { JSONStringify, promiseWithTimeout, equals, sleep } from "@orbiter-finance/utils";
import { Orbiter6Provider } from './provider'
import Keyv from "keyv";
import KeyvFile from "keyv-file";
import path from "path";
export class EVMAccount extends OrbiterAccount {
  protected wallet: Wallet;
  #provider: Orbiter6Provider;
  public nonceManager: NonceManager;
  constructor(protected chainId: string, protected readonly ctx: Context) {
    super(chainId, ctx);
  }
  get provider(): Orbiter6Provider {
    const rpc = this.chainConfig.rpc[0];
    return new Orbiter6Provider(rpc)
  }
  // getProvider() {
  //   try {
  //     const rpc = this.chainConfig.rpc[0];
  //     this.#provider = new Orbiter6Provider(rpc)
  //     return this.#provider;
  //   } catch (error) {
  //     this.logger.error(`${this.chainConfig.chainId} - ${this.chainConfig.name} ${this.chainConfig.rpc[0]} getProvider error`, error)
  //   }
  //   // const network = new Network(this.chainConfig.name, this.chainConfig.chainId);
  //   // if (!this.#provider) {
  //   //   const provider = new Orbiter6Provider(rpc,
  //   //     network, {
  //   //     staticNetwork: network,
  //   //   });
  //   //   this.#provider = provider;
  //   // }
  //   // if (this.#provider && this.#provider.getUrl() != rpc) {
  //   //   this.logger.info(
  //   //     `rpc url changes new ${rpc} old ${this.#provider.getUrl()}`,
  //   //   );
  //   //   this.#provider = new Orbiter6Provider(rpc, network, {
  //   //     staticNetwork: network
  //   //   });
  //   // }
  //   // return this.#provider;
  // }

  async connect(privateKey: string, _address?: string) {
    this.wallet = new ethers.Wallet(privateKey).connect(this.provider);
    if (_address) {
      if (!equals(_address, this.wallet.address)) {
        throw new Error('The connected wallet address is inconsistent with the private key address')
      }
    }
    this.address = this.wallet.address;
    this.nonceManager = this.createNonceManager(this.address, async () => {
      const nonce = await this.wallet.getNonce("pending");
      return Number(nonce);
    })
    return this;
  }

  async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    try {
      const balance = await this.getTokenBalance(token);
      if (balance < value) {
        throw new TransactionSendConfirmFail(
          `The sender ${token} has insufficient balance`
        );
      }
      const ifa = new Interface(ERC20Abi);
      const data = ifa.encodeFunctionData("transfer", [to, value]);
      transactionRequest.data = data;
      transactionRequest.to = token;
      transactionRequest.value = 0n;
      transactionRequest.from = this.wallet.address;
      // get erc20 getLimit
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const tx = await this.sendTransaction(transactionRequest);
    return {
      hash: tx.hash,
      nonce: tx.nonce,
      from: tx.from,
      to,
      token,
      value,
      _response: tx,
    };
  }

  async getGasPrice(transactionRequest: TransactionRequest): Promise<TransactionRequest> {
    const chainConfig = this.chainConfig;
    const chainCustomConfig = await this.ctx.envConfigService.getAsync(chainConfig.chainId) || {};
    const provider = this.provider;
    if (!transactionRequest.gasLimit) {
      try {
        const gasLimit = await provider.estimateGas({
          from: transactionRequest.from,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value,
        });
        const gasLimitRedouble = Number(chainCustomConfig.gasLimitRedouble || 1);
        if (gasLimit) {
          transactionRequest.gasLimit = new BigNumber(String(gasLimit)).times(gasLimitRedouble).toFixed(0);
        }
      } catch (error) {
        this.logger.info(`estimateGas error ${error.message}`);
      }
      if (!transactionRequest.gasLimit) {
        if (transactionRequest?.data && transactionRequest.data.length >= 500 && chainCustomConfig.defaultManyMintLimit) {
          transactionRequest.gasLimit = new BigNumber(chainCustomConfig.defaultManyMintLimit).toFixed(0);
        } else {
          if (chainCustomConfig.defaultSingleMintLimit) {
            transactionRequest.gasLimit = new BigNumber(chainCustomConfig.defaultSingleMintLimit).toFixed(0);
          }
        }
      }

    }
    const isEIP1559 = chainCustomConfig['EIP1559'];
    const feeData = await provider.getFeeData();
    // calc gas
    const feePerGasRedouble = Number(chainCustomConfig.FeePerGasRedouble || 1);
    if (isEIP1559) {
      transactionRequest.type = 2;
      const priorityFeePerGasRedouble = Number(chainCustomConfig.PriorityFeePerGasRedouble || 1);
      // maxFeePerGas
      let gasPrice = new BigNumber(String(feeData.maxFeePerGas || 0)).times(feePerGasRedouble);;
      if (chainCustomConfig.MaxFeePerGas && gasPrice.gte(chainCustomConfig.MaxFeePerGas)) {
        gasPrice = new BigNumber(chainCustomConfig.MaxFeePerGas || 0);
      } else if (chainCustomConfig.MinFeePerGas && gasPrice.lte(chainCustomConfig.MinFeePerGas)) {
        gasPrice = new BigNumber(chainCustomConfig.MinFeePerGas || 0);
      }
      transactionRequest.maxFeePerGas = new BigNumber(String(gasPrice || 0)).toFixed(0);
      // maxPriorityFeePerGas
      let maxPriorityFeePerGas = new BigNumber(String(feeData.maxPriorityFeePerGas || 0)).times(priorityFeePerGasRedouble);
      if (chainCustomConfig.MaxPriorityFeePerGas && maxPriorityFeePerGas.gte(chainCustomConfig.MaxPriorityFeePerGas)) {
        maxPriorityFeePerGas = new BigNumber(chainCustomConfig.MaxPriorityFeePerGas || 0);
      }
      transactionRequest.maxPriorityFeePerGas = new BigNumber(String(maxPriorityFeePerGas || 0)).toFixed(0);
      if (!transactionRequest.maxFeePerGas || !transactionRequest.maxPriorityFeePerGas) {
        throw new Error(`EIP1559 Fee fail, gasPrice:${transactionRequest.gasPrice}, feeData: ${JSON.stringify(feeData)}`)
      }
    } else {
      transactionRequest.type = 0;
      if (!transactionRequest.gasPrice && feeData.gasPrice) {
        let gasPrice = new BigNumber(String(feeData.gasPrice || 0)).times(feePerGasRedouble);
        if (chainCustomConfig.MaxFeePerGas && gasPrice.gte(chainCustomConfig.MaxFeePerGas)) {
          transactionRequest.gasPrice = chainCustomConfig.MaxFeePerGas;
        } else if (chainCustomConfig.MinFeePerGas && gasPrice.lte(chainCustomConfig.MinFeePerGas)) {
          transactionRequest.gasPrice = chainCustomConfig.MinFeePerGas;
        }
        // transactionRequest.gasPrice =new BigNumber(String(transactionRequest.gasPrice)).toFixed(0) ;
        transactionRequest.gasPrice = gasPrice.toFixed(0);
      }
      if (!transactionRequest.gasPrice) {
        throw new Error(`gasPrice Fee fail, gasPrice:${transactionRequest.gasPrice}, feeData: ${JSON.stringify(feeData)}`)
      }
    }
    // console.log('transactionRequest :', transactionRequest);
    return transactionRequest;
  }

  async transfer(
    to: string,
    value: bigint,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    try {
      const balance = await this.getBalance();
      if (balance < value) {
        throw new TransactionSendConfirmFail(
          "The sender has insufficient balance"
        );
      }
      transactionRequest.to = to;
      transactionRequest.value = value as any;
      transactionRequest.from = this.wallet.address;
      // get getLimit
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(transactionRequest);
    return response;
  }

  async transfers(
    tos: string[],
    values: bigint[],
    transactionRequest: TransactionRequest = {}
  ) {
    let router;
    const chainConfig = this.chainConfig;
    try {
      if (tos.length !== values.length) {
        throw new TransactionSendConfirmFail(
          "to and values are inconsistent in length"
        );
      }
      router = Object.keys(chainConfig.contract || {}).find(
        (addr) => chainConfig.contract[addr] === "OrbiterRouterV3"
      );
      if (!router) {
        throw new TransactionSendConfirmFail(
          "transferTokens router not config"
        );
      }
      const totalValue = values.reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        0n
      );
      //
      const balance = await this.getBalance();
      if (balance < totalValue) {
        throw new TransactionSendConfirmFail(
          "The sender has insufficient balance"
        );
      }
      if (!OrbiterRouterV3) {
        throw new TransactionSendConfirmFail("OrbiterRouterV3 ABI Not Found");
      }
      const ifa = new Interface(OrbiterRouterV3);
      transactionRequest.value = totalValue;
      transactionRequest.to = router;
      transactionRequest.data = ifa.encodeFunctionData("transfers", [
        tos,
        values,
      ]);
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(transactionRequest);
    return response;
  }

  public async transferTokens(
    token: string,
    tos: string[],
    values: bigint[],
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse | undefined> {
    let router;
    const chainConfig = this.chainConfig;
    try {
      if (tos.length !== values.length) {
        throw new Error(
          "to and values are inconsistent in length"
        );
      }
      router = Object.keys(chainConfig.contract || {}).find(
        (addr) => chainConfig.contract[addr] === "OrbiterRouterV3"
      );
      if (!router) {
        throw new Error(
          "transferTokens router not config"
        );
      }
      const totalValue = values.reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        0n
      );
      const allowance = await this.allowance(token, router);
      this.logger.info(`allowance amount ${String(allowance)}`);
      if (BigInt(String(allowance)) < totalValue) {
        this.logger.info(`Insufficient authorization amount, ${String(allowance)} < ${String(totalValue)}`);
        await this.approve(token, router, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        await sleep(10000);
        return await this.transferTokens(token, tos, values, transactionRequest);
      }
      const balance = await this.getTokenBalance(token);
      if (balance < totalValue) {
        throw new TransactionSendConfirmFail(
          `The sender ${token} has insufficient balance`
        );
      }
      if (!OrbiterRouterV3) {
        throw new TransactionSendConfirmFail("OrbiterRouterV3 ABI Not Found");
      }
      const ifa = new Interface(OrbiterRouterV3);
      const data = ifa.encodeFunctionData("transferTokens", [
        token,
        tos,
        values,
      ]);
      transactionRequest.from = this.wallet.address;
      transactionRequest.data = data;
      transactionRequest.to = router;
      transactionRequest.value = "0x0";
      transactionRequest.chainId = Number(this.chainConfig.networkId);
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(transactionRequest);
    return response;
  }

  async waitForTransactionConfirmation(transactionHash) {
    const receipt = await this.provider.waitForTransaction(transactionHash, 2, 2 * 60 * 1000);
    return receipt;
  }

  // public async sendTransaction(
  //   to: string,
  //   transactionRequest: TransactionRequest = {}
  // ): Promise<TransactionResponse> {
  //   const serialIds =
  //     typeof transactionRequest.serialId === "string"
  //       ? [transactionRequest.serialId]
  //       : transactionRequest.serialId;
  //   this.chainConfig.debug && this.logger.debug(`sendTransaction serialIds: ${JSONStringify(serialIds)}`)
  //   const chainConfig = this.chainConfig;
  //   const provider = this.getProvider();
  //   const chainId: number | undefined = Number(
  //     transactionRequest.chainId || chainConfig.chainId
  //   );

  //   const tx: TransactionRequest = {
  //     chainId,
  //     ...transactionRequest,
  //     from: this.wallet.address,
  //     to,
  //   };
  //   const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
  //   let txHash;
  //   try {
  //     tx.nonce = nonce;
  //     if (tx.value) {
  //       tx.value = new BigNumber(String(tx.value)).toFixed(0);
  //     }
  //     this.logger.info(
  //       `${chainConfig.name} sendTransaction:${JSONStringify(tx)}`
  //     );
  //     const signedTx = await this.wallet.signTransaction(tx);
  //     txHash = keccak256(signedTx);
  //     const response = await provider.broadcastTransaction(signedTx);
  //     this.logger.info(
  //       `${chainConfig.name} sendTransaction txHash:${txHash}`
  //     );
  //     //
  //     submit();
  //     return response;
  //   } catch (error) {
  //     rollback();
  //     this.logger.error(
  //       `broadcastTransaction tx error:${txHash} - ${error.message}`,
  //       error
  //     );
  //     // rollback()
  //     if (isError(error, "NONCE_EXPIRED")) {
  //       throw new TransactionSendConfirmFail(error.message);
  //     }
  //     throw new TransactionFailedError(error.message);
  //   }
  // }

  public async sendTransaction(
    transactionRequest: TransactionRequest
  ): Promise<TransactionResponse> {
    const chainConfig = this.chainConfig;
    // const provider = this.getProvider();
    let nonceResult;
    try {
      nonceResult = await this.nonceManager.getNextNonce();
      if (nonceResult.localNonce > nonceResult.networkNonce + 20) {
        throw new TransactionSendConfirmFail('The Nonce network sending the transaction differs from the local one by more than 20');
      }
      if (transactionRequest.value)
        transactionRequest.value = new BigNumber(String(transactionRequest.value)).toFixed(0);
      transactionRequest.from = this.wallet.address;
      transactionRequest.chainId = chainConfig.chainId;
      transactionRequest.nonce = nonceResult.nonce;
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 2000 * 60);
      try {
        const populateTransaction = await this.wallet.populateTransaction(transactionRequest);
        if (populateTransaction.nonce > transactionRequest.nonce) {
          transactionRequest.nonce = populateTransaction.nonce;
        }
        if (!transactionRequest.gasLimit) {
          transactionRequest.gasLimit = populateTransaction.gasLimit;
        }
        if (!transactionRequest.gasPrice) {
          transactionRequest.gasPrice = populateTransaction.gasPrice;
        }
        if (!transactionRequest.maxFeePerGas) {
          transactionRequest.maxFeePerGas = populateTransaction.maxFeePerGas;
        }
        if (!transactionRequest.maxPriorityFeePerGas) {
          transactionRequest.maxPriorityFeePerGas = populateTransaction.maxPriorityFeePerGas;
        }
      } catch (error) {
        console.error('sendTransaction error', error);
        this.logger.error(
          `${chainConfig.name} sendTransaction before populateTransaction error:${JSONStringify(transactionRequest)}, message: ${error.message}`, error
        );
      }
      this.logger.info(
        `${chainConfig.name} sendTransaction before:${JSONStringify(transactionRequest)}`
      );
    } catch (error) {
      console.error(error);
      nonceResult && await nonceResult.rollback();
      this.logger.error(
        `${chainConfig.name} sendTransaction before error:${JSONStringify(transactionRequest)},Nonce: ${transactionRequest.nonce}, message: ${error.message}`, error
      );
      throw new TransactionSendConfirmFail(error.message);
    }
    if (!nonceResult) {
      throw new TransactionSendConfirmFail(`Nonce not obtained`);
    }
    try {
      const response = await this.wallet.sendTransaction(transactionRequest);
      this.logger.info(
        `${chainConfig.name} - [${transactionRequest.nonce}] - sendTransaction txHash: ${response.hash}`
      );
      await nonceResult.submit();
      return response;
    } catch (error) {
      await nonceResult.rollback();
      this.logger.error(
        `broadcastTransaction tx error:${transactionRequest.nonce} - ${error.message}， rpc: ${this.provider.getUrl()}`,
        error
      );
      if (isError(error, "NONCE_EXPIRED")) {
        this.logger.error(`sendTransaction NONCE_EXPIRED from:${transactionRequest.from}, to:${transactionRequest.to},nonce:${transactionRequest.nonce}, value:${transactionRequest.value}`);
        throw new TransactionSendConfirmFail(error.message);
      }
      throw new TransactionFailedError(error.message);
    }
  }
  public async mintInscription(
    transactionRequest: TransactionRequest
  ): Promise<TransactionResponse> {
    const chainConfig = this.chainConfig;
    // const provider = this.getProvider();
    let nonceResult;
    try {
      nonceResult = await this.nonceManager.getNextNonce();
      if (nonceResult.localNonce > nonceResult.networkNonce + 20) {
        throw new TransactionSendConfirmFail('The Nonce network sending the transaction differs from the local one by more than 20');
      }
      if (transactionRequest.value)
        transactionRequest.value = new BigNumber(String(transactionRequest.value)).toFixed(0);
      transactionRequest.from = this.wallet.address;
      transactionRequest.chainId = chainConfig.chainId;
      transactionRequest.nonce = nonceResult.nonce;
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 2000 * 60);
      try {
        const populateTransaction = await this.wallet.populateTransaction(transactionRequest);
        if (populateTransaction.nonce > transactionRequest.nonce) {
          transactionRequest.nonce = populateTransaction.nonce;
        }
        if (!transactionRequest.gasLimit) {
          transactionRequest.gasLimit = populateTransaction.gasLimit;
        }
        if (!transactionRequest.gasPrice) {
          transactionRequest.gasPrice = populateTransaction.gasPrice;
        }
        if (!transactionRequest.maxFeePerGas) {
          transactionRequest.maxFeePerGas = populateTransaction.maxFeePerGas;
        }
        if (!transactionRequest.maxPriorityFeePerGas) {
          transactionRequest.maxPriorityFeePerGas = populateTransaction.maxPriorityFeePerGas;
        }
      } catch (error) {
        console.error(error);
        this.logger.error(
          `${chainConfig.name} sendTransaction before populateTransaction error:${JSONStringify(transactionRequest)}, message: ${error.message}`, error
        );
      }
      this.logger.info(
        `${chainConfig.name} sendTransaction before:${JSONStringify(transactionRequest)}`
      );
    } catch (error) {
      console.error(error);
      nonceResult && await nonceResult.rollback();
      this.logger.error(
        `${chainConfig.name} sendTransaction before error:${JSONStringify(transactionRequest)},Nonce: ${transactionRequest.nonce}, message: ${error.message}`, error
      );
      throw new TransactionSendConfirmFail(error.message);
    }
    if (!nonceResult) {
      throw new TransactionSendConfirmFail(`Nonce not obtained`);
    }
    try {
      // const signedTx = await this.wallet.signTransaction(transactionRequest);
      // txHash = keccak256(signedTx);
      // response = await provider.broadcastTransaction(signedTx);
      const response = await this.wallet.sendTransaction(transactionRequest);
      this.logger.info(
        `${chainConfig.name} - [${transactionRequest.nonce}] - sendTransaction txHash: ${response.hash}`
      );
      await nonceResult.submit();
      return response;
    } catch (error) {
      await nonceResult.rollback();
      this.logger.error(
        `broadcastTransaction tx error:${transactionRequest.nonce} - ${error.message}`,
        error
      );
      if (isError(error, "NONCE_EXPIRED")) {
        this.logger.error(`sendTransaction NONCE_EXPIRED from:${transactionRequest.from}, to:${transactionRequest.to},nonce:${transactionRequest.nonce}, value:${transactionRequest.value}`);
        throw new TransactionSendConfirmFail(error.message);
      }
      throw new TransactionFailedError(error.message);
    }
  }

  public async approve(
    token: string,
    spender: string,
    value: string | BigNumber
  ) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(
      this.wallet
    );
    return await erc20["approve"](spender, value);
  }

  public async allowance(token: string, spender: string) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(
      this.wallet
    );
    return await erc20["allowance"](this.wallet.address, spender);
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    const chainConfig = this.chainConfig;
    if (token && token != chainConfig.nativeCurrency.address) {
      // is native
      return await this.getTokenBalance(token, address);
    } else {
      return await this.provider.getBalance(address || this.wallet.address);
    }
  }

  public async getTokenBalance(
    token: string,
    address?: string
  ): Promise<bigint> {
    try {
      const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
      return await erc20.balanceOf(address || this.wallet.address);
    } catch (error) {
      console.log('get balance error', error)
    }
  }

}
