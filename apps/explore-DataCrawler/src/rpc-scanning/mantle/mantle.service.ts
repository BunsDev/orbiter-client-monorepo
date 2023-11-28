import BigNumber from 'bignumber.js';
import { ethers } from 'ethers6';
import { EVMRpcScanningV6Service } from '../evm/evm.v6.service';

export class MantleRpcScanningService extends EVMRpcScanningV6Service {
  async getTransferFee(
    transaction: ethers.TransactionResponse,
    receipt: ethers.TransactionReceipt,
  ): Promise<string> {
    const fee = await super.getTransferFee(transaction, receipt);
    const l1Fee = receipt['extra']['l1Fee'];
    return new BigNumber(fee).plus(l1Fee).toFixed(0);
  }
}
