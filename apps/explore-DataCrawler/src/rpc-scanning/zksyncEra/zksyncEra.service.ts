import EVMV5Utils from '../evm/lib/v6';

import { EVMRpcScanningV5Service } from '../evm/evm.v5.service';


import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
import { TransactionReceipt, TransactionResponse } from '../rpc-scanning.interface';
import { ethers } from 'ethers6';
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
                    }
                } else {
                    // Direct transfer
                    const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.receiver, transfer.value);
                    if (!event1) {
                        transfer.status = TransferAmountTransactionStatus.failed;
                    }
                }
            } else {
                // erc20c
                const event1 = EVMV5Utils.getTransferEvent(transfer.receipt.logs, transfer.sender, transfer.receiver, transfer.value);
                if (!event1) {
                    transfer.status = TransferAmountTransactionStatus.failed;
                }
            }
            if (transfer.receipt.logs) {
                try {
                    const logs = transfer.receipt.logs;
                    const paymasterLog = logs.find(log => log.address.toLocaleLowerCase() === '0x069246dfecb95a6409180b52c071003537b23c27'.toLocaleLowerCase() && log.topics[0].toLocaleLowerCase() == '0x2c0985141a7ef8a4b1a56c0a6099a18351ce9ceccf590eb87f1df5ac3cb97b45'.toLocaleLowerCase());
                    console.log(paymasterLog, '=paymasterLog')
                    if (paymasterLog) {
                        if (!transfer.label) {
                            transfer.label = {}
                        }
                        transfer.label['paymaster'] = 1;
                        if (paymasterLog.topics.length >= 2) {
                            transfer.label['paymaster-org'] = ethers.toUtf8String(paymasterLog.topics[1].replace(/00/g, ""))
                        }

                    }
                } catch (error) {
                    this.logger.error('valid is paymaster error', error);
                }

            }
            return transfer;
        });
    }

}
