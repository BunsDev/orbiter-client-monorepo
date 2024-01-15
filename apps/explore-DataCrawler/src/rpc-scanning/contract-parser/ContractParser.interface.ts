// ContractParser.ts
import { TransferAmountTransaction as TransferAmountTransactionBase } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';

export abstract class ContractParser {
  // abstract parseContract(chainId: string, contract: string, data: any): ParsedTransaction;
  abstract parse(contract: string, data: any): TransferAmountTransaction[];
}
export interface ContractRegistry {
  [address: string]: (contractData: string) => TransferAmountTransaction[];
}

export interface TransferAmountTransaction  extends TransferAmountTransactionBase {

};