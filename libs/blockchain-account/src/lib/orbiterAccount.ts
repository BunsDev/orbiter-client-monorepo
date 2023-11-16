import IAccount, {
  Context,
} from "./IAccount";
import { TransferResponse,TransactionRequest } from "./IAccount.interface";
import { StoreService } from "./store.service";
import { IChainConfig } from "@orbiter-finance/config";
import { OrbiterLogger,logger } from "@orbiter-finance/utils";

export class OrbiterAccount extends IAccount {
  public address: string;
  public logger!: OrbiterLogger;
  public store: StoreService;
  constructor(protected readonly chainId: string, protected readonly ctx: Context) {
    super(chainId, ctx);
    this.logger = logger.createLoggerByName(`account-${chainId}`);
    this.store = new StoreService(chainId);
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
    throw new Error("Method not implemented.");
  }

  public async transfers(
    _to: string[],
    value: bigint[],
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("Method not implemented.");
  }

  public async transferTokens(
    token: string,
    _to: string[],
    value: bigint[],
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("Method not implemented.");
  }

  public async getBalance(
    to?: string | undefined,
    token?: string | undefined
  ): Promise<bigint> {
    throw new Error("Method not implemented.");
  }

  public async getTokenBalance(token: string, to: string): Promise<bigint> {
    throw new Error("Method not implemented.");
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined> {
    throw new Error("Method not implemented.");
  }

  public async waitForTransactionConfirmation(
    transactionHash: string
  ): Promise<any> {
    throw new Error("waitForTransactionConfirmation Method not implemented.");
  }

  public async pregeneratedRequestParameters(
    orders: any[] | any,
    transactionRequest: TransactionRequest = {}
  ) {
    if (Array.isArray(orders)) {
      transactionRequest.serialId = [];
      for (const order of orders) {
        transactionRequest.serialId.push(order.sourceId);
      }
    } else {
      transactionRequest.serialId = orders['sourceId'];
    }
    return transactionRequest;
  }
}
