import { ENVConfigService } from '@orbiter-finance/config';
// ContractParserFactory.ts
import { TransferAmountTransaction, ContractRegistry, ContractParser } from './ContractParser.interface';
import { ChainConfigService } from '@orbiter-finance/config';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import implementParses from './implement/'
import { equals } from '@orbiter-finance/utils';
import { id } from 'ethers6';
@Injectable()
export class ContractParserService {
  private contractRegistry: { [contractName: string]: ContractParser } = {};
  constructor(
    private chainConfigService: ChainConfigService
  ) {
    this.registerContractByChains()
    setInterval(() => {
      this.registerContractByChains()
    }, 2000 * 60)
  }
  registerContractByChains() {
    const chains = this.chainConfigService.getAllChains();
    for (const chain of chains) {
      for (const contract of chain.contracts) {
        const implementClass = implementParses[contract.name];
        const registerName = `${chain.chainId}-${contract.name}`;
        if (implementClass && !this.contractRegistry[registerName]) {
          this.registerContract(registerName, new implementClass(chain));
        }
      }
    }
  }
  registerContract(registerName: string, instance: ContractParser) {
    this.contractRegistry[registerName] = instance;
  }
  existRegisterContract(chainId: string, contractAddress: string) {
    const chain = this.chainConfigService.getChainInfo(chainId);
    if (!chain.contracts) {
      return false;
    }
    const contract = chain.contracts.find(c => equals(contractAddress, c.address));
    if (!contract) {
      return false;
    }
    const registerName = `${chainId}-${contract.name}`;
    if (this.contractRegistry.hasOwnProperty(registerName)) {
      return true;
    }
    return false;
  }
  whiteContractMethodId(chainId: string, contractAddress: string, methodId: string,) {
    const chain = this.chainConfigService.getChainInfo(chainId);
    if (!chain.contracts) {
      return false;
    }
    const contract = chain.contracts.find(c => equals(contractAddress, c.address));
    if (!contract) {
      return false;
    }
    if (contract.methods) {
      const method = contract.methods.find(f => equals(id(f).substring(0, 10), methodId.substring(0, 10)))
      if (method) {
        return true;
      }
    }
    return false;
  }
  async parseContract(chainId: string, contractAddress: string, ...data: any[]): Promise<TransferAmountTransaction[]> {
    const chain = this.chainConfigService.getChainInfo(chainId);
    let transfers: TransferAmountTransaction[] = [];
    if (!this.existRegisterContract(chainId, contractAddress)) {
      throw new Error(`Chain ${chain.name} Contract ${contractAddress} Not Register`);
    }
    const contract = chain.contracts.find(c => equals(contractAddress, c.address));

    const registerName = `${chainId}-${contract.name}`;
    if (this.contractRegistry.hasOwnProperty(registerName)) {
      const instance = this.contractRegistry[registerName];
      transfers = await instance.parse(contractAddress, data) || [];
    } else {
      throw new Error(`${registerName} Contract decode parse not registered`);
    }
    return transfers;
  }

}
