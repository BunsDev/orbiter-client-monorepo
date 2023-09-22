import { ApiScanningService } from '../api-scanning.service';
import BigNumber from 'bignumber.js';
import { objectToQueryString, HTTPGet, isEmpty, uniq } from '@orbiter-finance/utils';
import * as ethers from 'ethers6';
import dayjs from 'dayjs';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
export class ZKLiteApiScanningService extends ApiScanningService {
  protected async getLastScannedPosition(prefix: string): Promise<string> {
    return super.getLastScannedPosition(prefix);
  }

  generateLastScannedPositionData(
    transfers: TransferAmountTransaction[],
  ): string {
    const transfer = transfers[transfers.length - 1];
    const receipt = transfer.receipt;
    const blockIndex = receipt.blockIndex;
    return `${transfer.blockNumber}-${blockIndex}-${transfer.timestamp}-${transfer.hash}`;
  }
  async getScanAddressList() {
    return await super.getScanEVMAddressList();
  }

  async timedTetTransactions(
    address: string,
  ): Promise<TransferAmountTransaction[]> {
    const params = {
      from: 'latest',
      limit: 100,
      direction: 'newer',
    };
    let prevBlockNum = 0,
      prevBlockIndex = 0,
      timestamp = dayjs().utc().valueOf();
    const position = await this.getLastScannedPosition(address).then((data) =>
      data.split('-'),
    );
    if (position && position.length >= 3) {
      prevBlockNum = +position[0];
      prevBlockIndex = +position[1];
      timestamp = +position[2];
      if (!isEmpty(position[3])) {
        params.from = position[3];
      }
    }
    const result = await this.getTransactions(address, params);
    if (result.error) {
      throw result.error;
    }

    if (result.transfers) {
      const transfers = result.transfers.filter((data) => {
        if (data.blockNumber < prevBlockNum) {
          return false;
        }
        if (data.blockNumber === prevBlockNum) {
          if (data.receipt['blockIndex'] <= prevBlockIndex) {
            return false;
          }
        }
        if (data.timestamp < timestamp) {
          return false;
        }
        return true;
      });

      const newTransfers = await this.filterTransfers(transfers);
      this.logger.debug(
        `${this.chainId} timedTetTransactions address ${address},  data total: ${transfers.length} / ${newTransfers.length}`,
      );
      if (newTransfers.length > 0) {
          const result =await this.processTransaction(newTransfers);
        const scanPosition = this.generateLastScannedPositionData(result);
        await this.setLastScannedPosition(address, scanPosition);
      } else {
        await this.setLastScannedPosition(
          address,
          `${prevBlockNum}-${prevBlockIndex}-${timestamp}-${params.from}`,
        );
      }
      return newTransfers;
    }
  }
  async getTransactions(
    address: string,
    params: any,
  ): Promise<{
    transfers: TransferAmountTransaction[];
    response: any;
    error?: any;
  }> {
    const chainConfig = this.chainConfig;
    const transfers: TransferAmountTransaction[] = [];
    // const params = {
    //     from: "latest",
    //     limit: 100,
    //     direction: "newer",
    // }
    let response;
    try {
      const url = `${chainConfig.api.url
        }/accounts/${address}/transactions?${objectToQueryString(params)}`;
      response = await HTTPGet(url);
      if (response && response['status'] === 'success') {
        const { list } = response['result'];
        for (const row of list) {
          const op = row.op;
          const value = new BigNumber(op.amount);
          const fee = new BigNumber(op.fee);
          const token = this.getToken(op.token);
          if (token) {
            const transferTx: TransferAmountTransaction = {
              chainId: this.chainId,
              hash: row['txHash'],
              blockNumber: row['blockNumber'],
              sender: op.from,
              receiver: op.to,
              value: value.toFixed(0),
              amount: value.div(Math.pow(10, token.decimals)).toString(),
              token: token.address,
              symbol: token.symbol,
              fee: fee.toString(),
              feeToken: chainConfig.nativeCurrency.symbol,
              feeAmount: new BigNumber(fee.toString())
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString(),
              timestamp: new Date(row.createdAt).valueOf(),
              status: TransferAmountTransactionStatus.none,
              nonce: op.nonce,
              receipt: row,
            };
            if (row.status === 'committed') {
              transferTx.status = TransferAmountTransactionStatus.confirmed;
              // transferTx.status = TransferAmountTransactionStatus.pending;
            } else if (row.status === 'finalized') {
              transferTx.status = TransferAmountTransactionStatus.confirmed;
            } else {
              transferTx.status = TransferAmountTransactionStatus.failed;
            }
            transfers.push(transferTx);
          }
        }
      }
      return { transfers, response };
    } catch (error) {
      return { transfers, response, error };
    }
  }
}
