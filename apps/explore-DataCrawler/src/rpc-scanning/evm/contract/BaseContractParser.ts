// ContractParserFactory.ts
import { ParsedTransaction, ContractRegistry } from './ContractParser';
import { Injectable } from '@nestjs/common';
import { ChainConfigService } from '@orbiter-finance/config';

@Injectable()
export class BaseContractParser {
  
  private contractRegistry: ContractRegistry = {};
  
  registerContract(functionName: string, parser: (contractData: string) => ParsedTransaction) {
    this.contractRegistry[functionName] = parser;
  }
  parseContract(chainId: string, contract: string, data: any): ParsedTransaction {
    const key = `${chainId}-${contract}`;
    if (this.contractRegistry.hasOwnProperty(key)) {
      const parser = this.contractRegistry[key];
      return parser(contract);
    } else {
      throw new Error('Contract address not registered');
    }
  }
}
