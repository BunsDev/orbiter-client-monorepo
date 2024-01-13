// import { BaseContractParser } from "../ContractParser.service";
import { ContractParser,TransferAmountTransaction } from "../ContractParser.interface";
export default class OrbiterRouterV1{
    constructor() {
    }
    parseCrossTransfer(chainId: string, contract: string, data: any): TransferAmountTransaction[] {
        return 'TransitFinanceRouterV5' as any;
    }
}