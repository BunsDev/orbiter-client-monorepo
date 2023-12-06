import BigNumber from 'bignumber.js';
import { EVMRpcScanningV6Service } from '../evm/evm.v6.service';
import { ethers } from 'ethers6';

export class ArbitrumRpcScanningService extends EVMRpcScanningV6Service {
  async getTransferFee(
    transaction: ethers.TransactionResponse,
    receipt: ethers.TransactionReceipt,
  ): Promise<string> {
    const gasUsed = receipt.gasUsed.toString();
    const gasPrice = receipt.gasPrice.toString();
    // const gasUsedForL1 = receipt['extra']['gasUsedForL1'];
    const fee = new BigNumber(gasUsed).multipliedBy(gasPrice).toFixed(0);
    // const l1Fee = new BigNumber(gasUsed).multipliedBy(gasUsedForL1).toFixed(0);
    return fee;
  }
}
