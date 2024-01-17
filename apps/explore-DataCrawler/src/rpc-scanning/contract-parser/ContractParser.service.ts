import { ENVConfigService } from '@orbiter-finance/config';
// ContractParserFactory.ts
import { TransferAmountTransaction, ContractRegistry, ContractParser } from './ContractParser.interface';
import { ChainConfigService } from '@orbiter-finance/config';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import implementParses from './implement/'
import { isEmpty } from 'lodash';
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
  existRegisterContract(chainId: string, contractAddress: string) {
    const chain = this.chainConfigService.getChainInfo(chainId);
    const contractName = chain.contract[contractAddress.toLocaleLowerCase()];
    if (!contractName) {
      return false;
    }
    const registerName = `${chainId}-${contractName}`;
    if (this.contractRegistry.hasOwnProperty(registerName)) {
      return true;
    }
    return false;
  }
  async parseContract(chainId: string, contractAddress: string, ...data: any[]): Promise<TransferAmountTransaction[]> {
    const chain = this.chainConfigService.getChainInfo(chainId);
    let transfers: TransferAmountTransaction[] = [];
    const contractName = chain.contract[contractAddress.toLocaleLowerCase()];
    if (!contractName) {
      throw new Error(`Chain ${chain.name} Contract ${contractAddress} Not Register`);
    }
    const registerName = `${chainId}-${contractName}`;
    if (this.contractRegistry.hasOwnProperty(registerName)) {
      const instance = this.contractRegistry[registerName];
      transfers = await instance.parse(contractAddress, data) || [];
    } else {
      throw new Error(`${registerName} Contract decode parse not registered`);
    }
    return transfers;
  }

}
