import { BaseContractParser } from "../BaseContractParser";
import { ContractParser, ParsedTransaction } from "../ContractParser";
export class TransitFinanceRouterV5 {
    constructor() {
        BaseContractParser.registerContract('TransitFinanceRouterV5', new TransitFinanceRouterV5());
    }
    parseCrossTransfer(chainId: string, contract: string, data: any): ParsedTransaction {
        return 'TransitFinanceRouterV5' as any;
    }
}