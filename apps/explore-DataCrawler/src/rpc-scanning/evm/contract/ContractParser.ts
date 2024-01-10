// BaseContractParser.ts
export abstract class ContractParser {
  // abstract parseContract(chainId: string, contract: string, data: any): ParsedTransaction;
  abstract parseCrossTransfer(chainId: string, contract: string, data: any): ParsedTransaction;
}
export interface ContractRegistry {
  [address: string]: (contractData: string) => ParsedTransaction;
}

export interface ParsedTransaction {
  from: string;
  to: string;
  amount: number;
}