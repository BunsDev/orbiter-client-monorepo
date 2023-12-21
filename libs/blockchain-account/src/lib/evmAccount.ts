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
  TransactionSendBeforeError,
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
    }catch(error) {
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
        throw new TransactionSendBeforeError(
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
      throw new TransactionSendBeforeError(error.message);
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
      const gasLimit = await provider.estimateGas({
        from: transactionRequest.from,
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
      });
      transactionRequest.gasLimit = gasLimit;

      if (!transactionRequest.gasLimit) {
        throw new Error('gasLimit Fee fail')
      }
    }
    let isEIP1559 = false;
    const feeData = await provider.getFeeData();
    if (transactionRequest.type === 0) {
      isEIP1559 = false;
    } else if (transactionRequest.type === 2) {
      isEIP1559 = true;
    } else {
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        isEIP1559 = true;
      }
    }
    // calc gas
    const feePerGasRedouble = Number(chainCustomConfig.FeePerGasRedouble || 1);
    if (isEIP1559) {
      transactionRequest.type = 2;
      const priorityFeePerGasRedouble = Number(chainCustomConfig.PriorityFeePerGasRedouble || 1);
      // maxFeePerGas
      let gasPrice = new BigNumber(feeData.maxFeePerGas.toString()).times(feePerGasRedouble);;
      if (chainCustomConfig.MaxFeePerGas && gasPrice.gte(chainCustomConfig.MaxFeePerGas)) {
        gasPrice = new BigNumber(chainCustomConfig.MaxFeePerGas);
      } else if (chainCustomConfig.MinFeePerGas && gasPrice.lte(chainCustomConfig.MinFeePerGas)) {
        gasPrice = new BigNumber(chainCustomConfig.MinFeePerGas);
      }
      transactionRequest.maxFeePerGas = gasPrice.toString();
      // maxPriorityFeePerGas
      let maxPriorityFeePerGas = new BigNumber(feeData.maxPriorityFeePerGas.toString()).times(priorityFeePerGasRedouble);
      if (chainCustomConfig.MaxPriorityFeePerGas && maxPriorityFeePerGas.gte(chainCustomConfig.MaxPriorityFeePerGas)) {
        maxPriorityFeePerGas = new BigNumber(chainCustomConfig.MaxPriorityFeePerGas);
      }
      transactionRequest.maxPriorityFeePerGas = maxPriorityFeePerGas.toString();

      if (!transactionRequest.maxFeePerGas || !transactionRequest.maxPriorityFeePerGas) {
        throw new Error(`EIP1559 Fee fail, gasPrice:${transactionRequest.gasPrice}, feeData: ${JSON.stringify(feeData)}`)
      }
    } else {
      transactionRequest.type = 0;
      if (!transactionRequest.gasPrice) {
        let gasPrice = new BigNumber(feeData.gasPrice.toString()).times(feePerGasRedouble);;
        if (chainCustomConfig.MaxFeePerGas && gasPrice.gte(chainCustomConfig.MaxFeePerGas)) {
          transactionRequest.gasPrice = chainCustomConfig.MaxFeePerGas;
        } else if (chainCustomConfig.MinFeePerGas && gasPrice.lte(chainCustomConfig.MinFeePerGas)) {
          transactionRequest.gasPrice = chainCustomConfig.MinFeePerGas;
        }
        transactionRequest.gasPrice = gasPrice.toString();
      }
      if (!transactionRequest.gasPrice) {
        throw new Error(`gasPrice Fee fail, gasPrice:${transactionRequest.gasPrice}, feeData: ${JSON.stringify(feeData)}`)
      }
    }
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
        throw new TransactionSendBeforeError(
          "The sender has insufficient balance"
        );
      }
      transactionRequest.to = to;
      transactionRequest.value = value as any;
      transactionRequest.from = this.wallet.address;
      // get getLimit
      await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      throw new TransactionSendBeforeError(error.message);
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
        throw new TransactionSendBeforeError(
          "to and values are inconsistent in length"
        );
      }
      router = Object.keys(chainConfig.contract || {}).find(
        (addr) => chainConfig.contract[addr] === "OrbiterRouterV3"
      );
      if (!router) {
        throw new TransactionSendBeforeError(
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
        throw new TransactionSendBeforeError(
          "The sender has insufficient balance"
        );
      }
      if (!OrbiterRouterV3) {
        throw new TransactionSendBeforeError("OrbiterRouterV3 ABI Not Found");
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
      throw new TransactionSendBeforeError(error.message);
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
        throw new TransactionSendBeforeError(
          "to and values are inconsistent in length"
        );
      }
      router = Object.keys(chainConfig.contract || {}).find(
        (addr) => chainConfig.contract[addr] === "OrbiterRouterV3"
      );
      if (!router) {
        throw new TransactionSendBeforeError(
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
        throw new TransactionSendBeforeError(
          `The sender ${token} has insufficient balance`
        );
      }
      if (!OrbiterRouterV3) {
        throw new TransactionSendBeforeError("OrbiterRouterV3 ABI Not Found");
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
      throw new TransactionSendBeforeError(error.message);
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
      await this.store.saveSerialRelTxHash(serialIds, txHash);
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
        throw new TransactionSendBeforeError(error.message);
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
  }catch(error){
    console.log('get balance error', error)
  }
  }

}
