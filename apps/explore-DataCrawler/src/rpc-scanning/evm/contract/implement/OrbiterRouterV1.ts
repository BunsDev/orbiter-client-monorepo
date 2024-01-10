import { BaseContractParser } from "../BaseContractParser";
import { ContractParser,ParsedTransaction } from "../ContractParser";
export class OrbiterRouterV1 extends BaseContractParser {
    constructor() {
        super();
    }
    parseCrossTransfer(chainId: string, contract: string, data: any): ParsedTransaction {
        return 'TransitFinanceRouterV5' as any;
    }
}