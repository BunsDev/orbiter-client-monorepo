// ContractParserFactory.ts
import { TransferAmountTransaction, ContractRegistry, ContractParser } from './ContractParser.interface';
import { ChainConfigService } from '@orbiter-finance/config';
import { TransitFinanceRouterV5 } from './implement/TransitFinanceRouterV5';
import { XBridge } from './implement/XBridge';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConsulService } from 'nestjs-consul';
@Injectable()
export class ContractParserService {
  private contractRegistry: { [contractName: string]: ContractParser } = {};
  constructor(private chainConfigService: ChainConfigService, private readonly consul: ConsulService<any>) {
      const chains = this.chainConfigService.getAllChains();
      console.log(chains, '===chains');
    this.registerContract('TransitFinanceRouterV5', new TransitFinanceRouterV5());
    this.registerContract('XBridge', new XBridge(null));
    const configs = this.consul.configs;
    console.log(configs, '=configs')

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
    if (this.contractRegistry.hasOwnProperty(contractName)) {
      const instance = this.contractRegistry[contractName];
      // const parser = this.contractRegistry[contractName];
      return instance.parse(chainId, contractAddr, data);
    } else {
      throw new Error('Contract decode parse not registered');
    }
  }

}
