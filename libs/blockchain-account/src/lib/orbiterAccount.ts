import {
  Context,
} from "./IAccount";
import { TransferResponse, TransactionRequest } from "./IAccount.interface";
import { IChainConfig } from "@orbiter-finance/config";
import { OrbiterLogger, logger } from "@orbiter-finance/utils";
import { EventEmitter } from 'events';
import Keyv from "keyv";
import KeyvFile from "keyv-file";
import path from "path";
import { NonceManager } from "./nonceManager";
import { camelCase } from "lodash";
// import { EVMNonceManager } from "./nonceManager/evmNonceManager";
import { ErrorTracker } from './ErrorTracker';
export class OrbiterAccount extends EventEmitter {
  public address: string;
  public logger!: OrbiterLogger;
  public errorTracker: ErrorTracker;
  public nonceManager?: NonceManager;
  constructor(protected readonly chainId: string, protected readonly ctx: Context) {
    super();
    this.logger = logger.createLoggerByName(`account-${camelCase(this.chainConfig.name)}`);
    this.errorTracker = new ErrorTracker(10);
  }

  get chainConfig(): IChainConfig {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }
  async connect(_privateKey: string, _address?: string) {
    return this;
  }

  public async transfer(
    _to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("transfer Method not implemented.");
  }

  public async transfers(
    _to: string[],
    value: bigint[],
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("transfers Method not implemented.");
  }

  public async transferTokens(
    token: string,
    _to: string[],
    value: bigint[],
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("transferTokens Method not implemented.");
  }

  public async getBalance(
    to?: string | undefined,
    token?: string | undefined
  ): Promise<bigint> {
    throw new Error("getBalance Method not implemented.");
  }

  public async getTokenBalance(token: string, to: string): Promise<bigint> {
    throw new Error("getTokenBalance Method not implemented.");
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("transferToken Method not implemented.");
  }

  public async waitForTransactionConfirmation(
    transactionHash: string
  ): Promise<any> {
    throw new Error("waitForTransactionConfirmation Method not implemented.");
  }
  public createNonceManager(address: string, getNonceFun: Function) {
    const store = new Keyv({
      store: new KeyvFile({
        filename: path.join(process.cwd(), "runtime", "nonce", `${this.chainId}-${address}.json`), // the file path to store the data
        expiredCheckDelay: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
        writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write perfor
      }),
      namespace: address,
    });
    const nonceManager = new NonceManager(async () => {
      return await getNonceFun();
    }, store);
    return nonceManager;
  }
  public createEVMNonceManager(address: string, getNonceFun: Function) {
    const store = new Keyv({
      store: new KeyvFile({
        filename: path.join(process.cwd(), "runtime", "nonce", `${this.chainId}-${address}.json`), // the file path to store the data
        expiredCheckDelay: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
        writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write perfor
      }),
      namespace: address,
    });
    const nonceManager = new NonceManager(async () => {
      return await getNonceFun();
    }, store, {
      beforeCommit: true
    });
    return nonceManager;
  }
}
