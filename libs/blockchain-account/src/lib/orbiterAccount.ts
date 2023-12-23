import IAccount, {
  Context,
} from "./IAccount";
import { TransferResponse,TransactionRequest } from "./IAccount.interface";
import { IChainConfig } from "@orbiter-finance/config";
import { OrbiterLogger,logger } from "@orbiter-finance/utils";

export class OrbiterAccount extends IAccount {
  public address: string;
  public logger!: OrbiterLogger;
  constructor(protected readonly chainId: string, protected readonly ctx: Context) {
    super(chainId, ctx);
    this.logger = logger.createLoggerByName(`account-${chainId}`);
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

}
