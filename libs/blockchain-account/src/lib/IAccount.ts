import { ChainConfigService,ENVConfigService } from "@orbiter-finance/config";
import { TransactionRequest, TransferResponse } from "./IAccount.interface";
// import { NonceManager } from "./nonceManager";


export interface Context {
  chainConfigService:ChainConfigService,
  envConfigService: ENVConfigService
}
// export default abstract class IAccount {
//   constructor(protected chainId: string, ctx:Context) {}
//   public abstract transfer(
//     to: string,
//     value: bigint,
//     transactionRequest?: TransactionRequest | any
//   ): Promise<TransferResponse | undefined>;
//   public abstract getBalance(to?: string, token?: string): Promise<bigint>;
//   public abstract getTokenBalance(token: string, to: string): Promise<bigint>;
//   public abstract transferToken(
//     token: string,
//     to: string,
//     value: bigint,
//     transactionRequest?: TransactionRequest | any
//   ): Promise<TransferResponse | undefined>;
// }
