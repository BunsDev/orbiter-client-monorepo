import { ENVConfigService } from '@orbiter-finance/config';
// ContractParserFactory.ts
import { TransferAmountTransaction, ContractRegistry, ContractParser } from './ContractParser.interface';
import { ChainConfigService } from '@orbiter-finance/config';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import implementParses from './implement/'
console.log(implementParses, '=implementParses')
@Injectable()
export class ContractParserService {
  private contractRegistry: { [contractName: string]: ContractParser } = {};
  constructor(
    private chainConfigService: ChainConfigService
    ) {
    const chains = this.chainConfigService.getAllChains();
    for (const chain of chains) {
      for (const className in implementParses) {
        for (const addr in chain.contract) {
          if (chain.contract[addr] === className) {
            this.registerContract(`${chain.chainId}-${className}`, new implementParses[className](chain));
          }
        }
      }
    }
  }
  registerContract(contractName: string, instance: ContractParser) {
    this.contractRegistry[contractName] = instance;
  }
  parseContract(chainId: string, contractAddr: string, ...data: any[]): TransferAmountTransaction[] {
    const chain = this.chainConfigService.getChainInfo(chainId);
    const contractName = chain.contract[contractAddr.toLocaleLowerCase()];
    if (!contractName) {
      throw new Error(`Chain ${chain.name} Contract ${contractAddr} Not Register`);
    }
    const registerName = `${chainId}-${contractName}`;
    if (this.contractRegistry.hasOwnProperty(registerName)) {
      const instance = this.contractRegistry[registerName];
      // const parser = this.contractRegistry[contractName];
      return instance.parse(contractAddr, data);
    } else {
      throw new Error(`${registerName} Contract decode parse not registered`);
    }
  }

}
