import { Orbiter6Provider } from '@orbiter-finance/blockchain-account';
import {
  ethers,
  Interface,
  isError,
  JsonRpcProvider,
  Network,
  type Wallet,
} from "ethers6";
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
  NonceISTooDifferent
} from "./IAccount.interface";
import { JSONStringify, promiseWithTimeout, equals, sleep } from "@orbiter-finance/utils";
export class EVMAccount extends OrbiterAccount {
  protected wallet: Wallet;
  #provider: Orbiter6Provider;
  constructor(protected chainId: string, protected readonly ctx: Context) {
    super(chainId, ctx);
  }
  get provider() {
    const rpc = this.chainConfig.rpc[0];
    const network = new Network(this.chainConfig.name, this.chainConfig.chainId);
    if (!this.#provider || this.#provider.url != rpc) {
      if (this.#provider && this.#provider.url != rpc) {
        this.logger.info(
          `rpc url changes new ${rpc} old ${this.#provider.url}`,
        );
      }
      const provider = new Orbiter6Provider(rpc,
        network, {
        staticNetwork: network,
      });
      provider.on('error', (error) => {
        this.logger.error(`${this.chainConfig.name} provider6 error ${error.message}`, error);
        this.errorTracker.trackError('provider');
        if (!this.errorTracker.isOperationAvailable) {
          provider.destroy()
          this.logger.error(`${this.chainConfig.name} provider6 The instance is unavailable and will be destroyed.${provider.destroyed}`);
        }
      })
      this.#provider = provider;
    }
    return this.#provider;
  }

  async connect(privateKey: string, _address?: string) {
    this.wallet = new ethers.Wallet(privateKey).connect(this.provider);
    if (_address) {
      if (!equals(_address, this.wallet.address)) {
        throw new Error('The connected wallet address is inconsistent with the private key address')
      }
    }
    if (!this.nonceManager || !equals(this.wallet.address, this.address)) {
      this.nonceManager = this.createEVMNonceManager(this.address, async () => {
        const nonce = await this.wallet.getNonce("pending");
        return Number(nonce);
      })
    }
    this.address = this.wallet.address;
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
      // get erc20 getLimit
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      this.logger.error(`${this.chainConfig.name} transferToken getBalance error ${error.message}`, error)
      if (error instanceof TransactionSendConfirmFail) {
        throw error;
      }
    }
    const ifa = new Interface(ERC20Abi);
    const data = ifa.encodeFunctionData("transfer", [to, value]);
    transactionRequest.data = data;
    transactionRequest.to = token;
    transactionRequest.value = 0n;
    transactionRequest.from = this.wallet.address;
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
    let isEIP1559 = chainCustomConfig['EIP1559'];
    const feeData = await provider.getFeeData();
    // calc gas
    if (isEIP1559 == undefined && feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      isEIP1559 = true;
    }
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
    if (await this.ctx.envConfigService.getAsync('DefaultUseLastBlockAvgGasPrice') || chainCustomConfig?.useLastBlockAvgGasPrice) {
      await this.getLastBlockAvgGasPrice(transactionRequest);
    }
    return transactionRequest;
  }

  async getLastBlockAvgGasPrice(transactionRequest: TransactionRequest) {
    const provider = this.provider;
    const height = await provider.getBlockNumber();
    const block: any = await provider.getBlock(height, true);
    const transactionList: any[] = block?.prefetchedTransactions || [];
    const logs = [];
    if (transactionRequest.type === 2) {
      let blockMaxFeePerGas = new BigNumber(0);
      let blockMaxPriorityFeePerGas = new BigNumber(0);
      let blockGasLimit = new BigNumber(0);
      let count = 0;
      for (const tx of transactionList) {
        if (!tx.maxFeePerGas || !tx.maxPriorityFeePerGas || !tx.gasLimit || +tx.data) continue;
        if (new BigNumber(String(tx.maxPriorityFeePerGas)).gt(500000000000)) {
          continue;
        }
        blockMaxFeePerGas = blockMaxFeePerGas.plus(String(tx.maxFeePerGas));
        blockMaxPriorityFeePerGas = blockMaxPriorityFeePerGas.plus(String(tx.maxPriorityFeePerGas));
        blockGasLimit = blockGasLimit.plus(String(tx.gasLimit));
        count++;
      }
      if (count) {
        blockMaxFeePerGas = blockMaxFeePerGas.dividedBy(count) || new BigNumber(0);
        blockMaxPriorityFeePerGas = blockMaxPriorityFeePerGas.dividedBy(count) || new BigNumber(0);
        blockGasLimit = blockGasLimit.dividedBy(count);
      }
      if (new BigNumber(String(transactionRequest.maxFeePerGas)).lt(blockMaxFeePerGas)) {
        logs.push(`blockMaxFeePerGas ${String(new BigNumber(String(transactionRequest.maxFeePerGas)).dividedBy(10 ** 9))
          } gWei < ${String(blockMaxFeePerGas.dividedBy(10 ** 9))} gWei`)
        transactionRequest.maxFeePerGas = BigInt(blockMaxFeePerGas.toFixed(0));
      }
      if (new BigNumber(String(transactionRequest.maxPriorityFeePerGas)).lt(blockMaxPriorityFeePerGas)) {
        logs.push(`blockMaxPriorityFeePerGas ${String(new BigNumber(String(transactionRequest.maxPriorityFeePerGas)).dividedBy(10 ** 9))
          } gWei < ${String(blockMaxPriorityFeePerGas.dividedBy(10 ** 9))} gWei`);
        transactionRequest.maxPriorityFeePerGas = BigInt(blockMaxPriorityFeePerGas.toFixed(0));
      }
      if (new BigNumber(String(transactionRequest.gasLimit)).lt(blockGasLimit)) {
        logs.push(`blockGasLimit ${String(transactionRequest.gasLimit)} < ${String(blockGasLimit)}`);
        transactionRequest.gasLimit = BigInt(blockGasLimit.toFixed(0));
      }
    } else {
      let blockGasPrice = new BigNumber(0);
      let blockGasLimit = new BigNumber(0);
      let count = 0;
      for (const tx of transactionList) {
        if (!tx.gasPrice || !tx.gasLimit || +tx.data) continue;
        blockGasPrice = blockGasPrice.plus(String(tx.gasPrice));
        blockGasLimit = blockGasLimit.plus(String(tx.gasLimit));
        count++;
      }
      if (count) {
        blockGasPrice = blockGasPrice.dividedBy(count) || new BigNumber(0);
        blockGasLimit = blockGasLimit.dividedBy(count);
      }
      if (new BigNumber(String(transactionRequest.gasPrice)).lt(blockGasPrice)) {
        logs.push(`blockGasPrice ${String(new BigNumber(String(transactionRequest.gasPrice)).dividedBy(10 ** 9))
          } gWei < ${String(blockGasPrice.dividedBy(10 ** 9))} gWei`);
        transactionRequest.gasPrice = BigInt(blockGasPrice.toFixed(0));
      }
      if (new BigNumber(String(transactionRequest.gasLimit)).lt(blockGasLimit)) {
        logs.push(`blockGasLimit ${String(transactionRequest.gasLimit)} < ${String(blockGasLimit)}`)
        transactionRequest.gasLimit = BigInt(blockGasLimit.toFixed(0));
      }
    }
    logs.length && this.logger.info(`${this.chainConfig.name} ${logs.join(', ')}`);
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
      // get getLimit
      // await promiseWithTimeout(this.getGasPrice(transactionRequest), 1000 * 30);
    } catch (error) {
      this.logger.error(`${this.chainConfig.name} transftransferers getBalance error ${error.message}`, error)
      if (error instanceof TransactionSendConfirmFail) {
        throw error;
      }
    }
    transactionRequest.to = to;
    transactionRequest.value = value as any;
    transactionRequest.from = this.wallet.address;
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
        throw new Error(
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
      try {
        //
        const balance = await this.getBalance();
        if (balance < totalValue) {
          throw new TransactionSendConfirmFail(
            "The sender has insufficient balance"
          );
        }
      } catch (error) {
        this.logger.error(`${this.chainConfig.name} transfers getBalance error ${error.message}`, error)
        if (error instanceof TransactionSendConfirmFail) {
          throw error;
        }
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

  public async sendTransaction(
    transactionRequest: TransactionRequest
  ): Promise<TransactionResponse> {
    const chainConfig = this.chainConfig;
    // const provider = this.provider;
    this.logger.info(`sendTransaction transactionRequest:${JSONStringify(transactionRequest)}`)
    const nonceResult = await this.nonceManager.getNextNonce();
    if (!nonceResult) {
      throw new TransactionSendConfirmFail('nonceResult nof found');
    }
    this.logger.info(`sendTransaction localNonce:${nonceResult.localNonce}, networkNonce:${nonceResult.networkNonce}, ready6SendNonce:${nonceResult.nonce}`)

    try {
      // if (nonceResult && +nonceResult.localNonce - nonceResult.networkNonce >= 20) {
      //   throw new TransactionSendConfirmFail('The Nonce network sending the transaction differs from the local one by more than 20');
      // }
      if (+nonceResult.localNonce - nonceResult.networkNonce >= 20) {
        this.emit("NonceISTooDifferent", nonceResult);
        throw new NonceISTooDifferent(`NonceISTooDifferent localNonce: ${nonceResult.localNonce}, networkNonce:${nonceResult.networkNonce}`);
      }
      if (transactionRequest.value)
        transactionRequest.value = new BigNumber(String(transactionRequest.value)).toFixed(0);
      transactionRequest.from = this.wallet.address;
      transactionRequest.chainId = +chainConfig.chainId;
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
        `${chainConfig.name} sendTransaction before:${JSONStringify(transactionRequest)}, rpc: ${this.chainConfig.rpc[0]}`
      );
    } catch (error) {
      console.error(error);
      await nonceResult.rollback();
      this.logger.error(
        `${chainConfig.name} sendTransaction before error:${JSONStringify(transactionRequest)},Nonce: ${transactionRequest.nonce}, message: ${error.message}`, error
      );
      throw new TransactionSendConfirmFail(error.message);
    }
    try {
      const response = await this.wallet.sendTransaction(transactionRequest);
      this.logger.info(
        `${chainConfig.name} - [${transactionRequest.nonce}] - sendTransaction txHash: ${response.hash}`
      );
      await nonceResult.submit();
      return response;
    } catch (error) {
      this.logger.error(
        `broadcastTransaction tx error:${transactionRequest.nonce} - ${error.message}， rpc: ${this.chainConfig.rpc[0]}`,
        error
      );
      await nonceResult.rollback();
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
    // const provider = this.provider;
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
