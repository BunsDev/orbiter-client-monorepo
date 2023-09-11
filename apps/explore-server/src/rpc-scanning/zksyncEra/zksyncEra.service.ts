import BigNumber from 'bignumber.js';
import { ZeroAddress } from 'ethers6';
import { provider, isEmpty, JSONStringify } from '@orbiter-finance/utils';
import EVMV5Utils from '../evm/lib/v6';

import { EVMRpcScanningV5Service } from '../evm/evm.v5.service';
import {
    Block,
    TransactionReceipt,
    TransactionResponse,
    TransferAmountTransaction,
    TransferAmountTransactionStatus,
} from '../rpc-scanning.interface';
export class ZKSyncEraRpcScanningService extends EVMRpcScanningV5Service {
    async handleTransaction(
        transaction: TransactionResponse,
        receipt?: TransactionReceipt,
    ): Promise<TransferAmountTransaction[] | null> {
        const transfers = await super.handleTransaction(transaction, receipt);
        const contractList = this.chainConfig.contract
            ? Object.keys(this.chainConfig.contract || {}).map((addr) => addr.toLocaleLowerCase())
            : [];
        for (const transfer of transfers) {
            if (!transfer.receipt) {
                transfer.status = TransferAmountTransactionStatus.failed;
                continue;
            }
            if (transfer.status === TransferAmountTransactionStatus.confirmed) {
                if (transfer.contract && contractList.includes(transfer.contract.toLocaleLowerCase())) {
                    //
                    const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.contract, transfer.value);
                    const event2 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.contract, transfer.receiver, transfer.value);
                    if (!event1 || !event2) {
                        transfer.status = TransferAmountTransactionStatus.failed;
                        continue;
                    }
                } else {
                    // not to contract
                    const event = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.receiver, transfer.value);
                    if (!event) {
                        transfer.status = TransferAmountTransactionStatus.failed;
                        continue;
                    }
                }

            }
        }
        console.log('zksync era', transfers);
        return transfers;
    }

}
