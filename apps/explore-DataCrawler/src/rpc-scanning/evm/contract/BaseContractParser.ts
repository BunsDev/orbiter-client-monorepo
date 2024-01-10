// ContractParserFactory.ts
import { ParsedTransaction, ContractRegistry } from './ContractParser';
import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';

@Injectable()
export class BaseContractParser {
  private static contractRegistry: { [contractName: string]: any } = {};

  static registerContract(contractName: string, abi: any) {
    this.contractRegistry[contractName] = abi;
  }
  constructor(private chainConfigService:ChainConfigService) {
    const chains = this.chainConfigService.getAllChains();
    for (const chain of chains) {

    }
  }
  private contractRegistry: ContractRegistry = {};
  registerContract(functionName: string, parser: (contractData: string) => ParsedTransaction) {
    this.contractRegistry[functionName] = parser;
  }
  parseContract(functionName:string, data: any): ParsedTransaction {
    if (this.contractRegistry.hasOwnProperty(functionName)) {
      const parser = this.contractRegistry[functionName];
      return parser(functionName);
    } else {
      throw new Error('Contract address not registered');
    }
  }
}
