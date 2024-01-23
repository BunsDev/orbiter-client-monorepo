import { KNOWN_ACCOUNT_CLASSES, KnownAccountClass } from './lib/StarknetAccountType';
import { ContractParser, TransferAmountTransaction } from "./ContractParser.interface";
import { TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { IChainConfig } from "@orbiter-finance/config";
import BigNumber from 'bignumber.js';
import { addressPadStart, equals } from '@orbiter-finance/utils';

export class StarknetPraser implements ContractParser {
    constructor(protected readonly chainInfo: IChainConfig) {
    }

    parse(contractAddress: string, [transaction, receipt]: any[]): TransferAmountTransaction[] {
        throw new Error(`${contractAddress} Not implemented`)
    }

    static cairoVersion(account: string,classAddress: string):KnownAccountClass {
        return KNOWN_ACCOUNT_CLASSES.find(row => equals(addressPadStart(row.class_hash, 66),addressPadStart(classAddress,66)));
    }

}

