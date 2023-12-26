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
  TransferResponse,
} from "./IAccount.interface";
import { JSONStringify, promiseWithTimeout, equals, sleep } from "@orbiter-finance/utils";
import { Orbiter6Provider } from './provider'
export class EVMAccount extends OrbiterAccount {
  protected wallet: Wallet;
  public nonceManager: NonceManager;
  #provider: Orbiter6Provider;
  constructor(protected chainId: string, protected readonly ctx: Context) {
    super(chainId, ctx);
  }
  getProvider() {
    try {
      const rpc = this.chainConfig.rpc[0];
      return new JsonRpcProvider(rpc)
    } catch (error) {
      console.error('getProvider error', error);
    }

    // const network = new Network(this.chainConfig.name, this.chainConfig.chainId);
    // if (!this.#provider) {
    //   const provider = new Orbiter6Provider(rpc,
    //     network, {
    //     staticNetwork: network,
    //   });
    //   this.#provider = provider;
    // }
    // if (this.#provider && this.#provider.getUrl() != rpc) {
    //   this.logger.info(
    //     `rpc url changes new ${rpc} old ${this.#provider.getUrl()}`,
    //   );
    //   this.#provider = new Orbiter6Provider(rpc, network, {
    //     staticNetwork: network
    //   });
    // }
    // return this.#provider;
  }

  async connect(privateKey: string, _address?: string) {
    const provider = this.getProvider();
    this.wallet = new ethers.Wallet(privateKey).connect(provider);
    if (_address) {
      if (!equals(_address, this.wallet.address)) {
        throw new Error('The connected wallet address is inconsistent with the private key address')
      }
    }
    this.address = this.wallet.address;
    if (!this.nonceManager) {
      this.nonceManager = new NonceManager(this.wallet.address, async () => {
        const nonce = await this.wallet.getNonce("pending");
        return Number(nonce);
      });
      await this.nonceManager.forceRefreshNonce();
    }
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
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const tx = await this.sendTransaction(token, transactionRequest);
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
    const provider = this.getProvider();
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
        if (transactionRequest.data.length >= 500 && chainCustomConfig.defaultManyMintLimit) {
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
      console.log('gasPrice:', gasPrice);
      transactionRequest.maxFeePerGas = new BigNumber(String(gasPrice || 0)).toFixed(0);
      // maxPriorityFeePerGas
      let maxPriorityFeePerGas = new BigNumber(String(feeData.maxPriorityFeePerGas || 0)).times(priorityFeePerGasRedouble);
      if (chainCustomConfig.MaxPriorityFeePerGas && maxPriorityFeePerGas.gte(chainCustomConfig.MaxPriorityFeePerGas)) {
        maxPriorityFeePerGas = new BigNumber(chainCustomConfig.MaxPriorityFeePerGas || 0);
      }
      console.log('maxPriorityFeePerGas:', maxPriorityFeePerGas);
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
        console.log('transactionRequest.gasPrice:', transactionRequest.gasPrice);
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
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(to, transactionRequest);
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
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(router, transactionRequest);
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
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendConfirmFail(error.message);
    }
    const response = await this.sendTransaction(router, transactionRequest);
    return response;
  }

  async waitForTransactionConfirmation(transactionHash) {
    const provider = this.getProvider();
    const receipt = await provider.waitForTransaction(transactionHash);
    return receipt;
  }

  public async sendTransaction(
    to: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransactionResponse> {
    const serialIds =
      typeof transactionRequest.serialId === "string"
        ? [transactionRequest.serialId]
        : transactionRequest.serialId;
    this.chainConfig.debug && this.logger.debug(`sendTransaction serialIds: ${JSONStringify(serialIds)}`)
    const chainConfig = this.chainConfig;
    const provider = this.getProvider();
    const chainId: number | undefined = Number(
      transactionRequest.chainId || chainConfig.chainId
    );

    const tx: TransactionRequest = {
      chainId,
      ...transactionRequest,
      from: this.wallet.address,
      to,
    };
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    let txHash;
    try {
      tx.nonce = nonce;
      if (tx.value) {
        tx.value = new BigNumber(String(tx.value)).toFixed(0);
      }
      this.logger.info(
        `${chainConfig.name} sendTransaction:${JSONStringify(tx)}`
      );
      const signedTx = await this.wallet.signTransaction(tx);
      txHash = keccak256(signedTx);
      const response = await provider.broadcastTransaction(signedTx);
      this.logger.info(
        `${chainConfig.name} sendTransaction txHash:${txHash}`
      );
      //
      submit();
      return response;
    } catch (error) {
      rollback();
      this.logger.error(
        `broadcastTransaction tx error:${txHash} - ${error.message}`,
        error
      );
      // rollback()
      if (isError(error, "NONCE_EXPIRED")) {
        throw new TransactionSendConfirmFail(error.message);
      }
      throw new TransactionFailedError(error.message);
    }
  }

  public async mintInscription(
    transactionRequest: TransactionRequest
  ): Promise<TransactionResponse> {
    const chainConfig = this.chainConfig;
    const provider = this.getProvider();
    let nonceResult;
    try {
      nonceResult = await this.nonceManager.getNextNonce();
      // const { nonce, submit, rollback } =nonceResult;
      if (transactionRequest.value)
        transactionRequest.value = new BigNumber(String(transactionRequest.value)).toFixed(0);
      transactionRequest.from = this.wallet.address;
      transactionRequest.chainId = chainConfig.chainId;
      transactionRequest.nonce = nonceResult.nonce;
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
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
          `${chainConfig.name} sendTransaction before populateTransaction error:${JSONStringify(transactionRequest)}, message: ${error.message}`
        );
      }
      this.logger.info(
        `${chainConfig.name} sendTransaction before:${JSONStringify(transactionRequest)}`
      );
    } catch (error) {
      console.error(error);
      nonceResult && nonceResult.rollback();
      this.logger.error(
        `${chainConfig.name} sendTransaction before error:${JSONStringify(transactionRequest)}, message: ${error.message}`
      );
      throw new TransactionSendConfirmFail(error.message);
    }
    let txHash;
    try {
      const signedTx = await this.wallet.signTransaction(transactionRequest);
      txHash = keccak256(signedTx);
      let response;
      let error;
      for (let i = 0; i < 3; i++) {
        try {
          response = await provider.broadcastTransaction(signedTx);
          this.logger.info(
            `${chainConfig.name} sendTransaction txHash:${txHash}`
          );
          break;
        } catch (error) {
          error = error;
          this.logger.info(
            `${chainConfig.name} sendTransaction broadcastTransaction error:${txHash}, message:${error.message}`
          );
        }
      }
      if (!response && error) {
        throw error;
      }
      nonceResult && nonceResult.submit();
      return response;
    } catch (error) {
      nonceResult && nonceResult.rollback();
      this.logger.error(
        `broadcastTransaction tx error:${txHash} - ${error.message}`,
        error
      );
      if (isError(error, "NONCE_EXPIRED")) {
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
    const provider = this.getProvider();
    const erc20 = new ethers.Contract(token, ERC20Abi, provider).connect(
      this.wallet
    );
    return await erc20["approve"](spender, value);
  }

  public async allowance(token: string, spender: string) {
    const provider = this.getProvider();
    const erc20 = new ethers.Contract(token, ERC20Abi, provider).connect(
      this.wallet
    );
    return await erc20["allowance"](this.wallet.address, spender);
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    const chainConfig = this.chainConfig;
    const provider = this.getProvider();
    if (token && token != chainConfig.nativeCurrency.address) {
      // is native
      return await this.getTokenBalance(token, address);
    } else {
      return await provider.getBalance(address || this.wallet.address);
    }
  }

  public async getTokenBalance(
    token: string,
    address?: string
  ): Promise<bigint> {
    const provider = this.getProvider();
    try {
      const erc20 = new ethers.Contract(token, ERC20Abi, provider);
      return await erc20.balanceOf(address || this.wallet.address);
    } catch (error) {
      console.log('get balance error', error)
    }
  }

}
