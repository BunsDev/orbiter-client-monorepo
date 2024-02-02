import EVMV5Utils from '../evm/lib/v6';

import { EVMRpcScanningV5Service } from '../evm/evm.v5.service';


import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
import { TransactionReceipt, TransactionResponse } from '../rpc-scanning.interface';
export class ZKSyncEraRpcScanningService extends EVMRpcScanningV5Service {

  async handleTransaction(
    transaction: TransactionResponse,
    receipt?: TransactionReceipt,
  ): Promise<TransferAmountTransaction[] | null> {
        console.log(transaction, '=transaction')
        const transfers = await super.handleTransaction(transaction as any, receipt as any);
        
        return transfers;
    }
    async handleTransactionAfter(transfers: TransferAmountTransaction[]): Promise<TransferAmountTransaction[]> {
        const contractList = this.chainConfig.contract
            ? Object.keys(this.chainConfig.contract || {}).map((addr) => addr.toLocaleLowerCase())
            : [];
        return transfers.map(transfer => {
            if (transfer.status !== TransferAmountTransactionStatus.confirmed) {
                return transfer;
            }
            if (this.ctx.chainConfigService.inValidMainToken(transfer.chainId, transfer.token)) {
                // main token
                if (transfer.contract && contractList.includes(transfer.contract.toLocaleLowerCase())) {
                    // Contract transfer
                    const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.contract, transfer.value);
                    const event2 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.contract, transfer.receiver, transfer.value);
                    if (!event1 || !event2) {
                        transfer.status = TransferAmountTransactionStatus.failed;
                        return transfer;
                    }
                } else {
                    // Direct transfer
                    const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.receiver, transfer.value);
                    if (event1) {
                        transfer.status = TransferAmountTransactionStatus.confirmed;
                        return transfer;
                    }
                }
            } else {
                // erc20c
                const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.receiver, transfer.value);
                if (event1) {
                    transfer.status = TransferAmountTransactionStatus.confirmed;
                    return transfer;
                }
            }
            return transfer;
        });
    }

}
