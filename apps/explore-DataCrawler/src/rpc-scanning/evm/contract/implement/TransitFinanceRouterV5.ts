import { BaseContractParser } from "../BaseContractParser";
import { ContractParser,ParsedTransaction } from "../ContractParser";
export class TransitFinanceRouterV5 extends BaseContractParser {
    constructor() {
        super();
        this.registerContract('TransitFinanceRouterV5:0x6b3ec416', this.parseCrossTransfer);
    }
    parseCrossTransfer(chainId: string, contract: string, data: any): ParsedTransaction {
        return 'TransitFinanceRouterV5' as any;
    }
}