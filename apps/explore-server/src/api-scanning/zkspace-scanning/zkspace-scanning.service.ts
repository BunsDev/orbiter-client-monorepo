import { ApiScanningService } from '../api-scanning.service';
import BigNumber from 'bignumber.js';
import {
  TransferAmountTransaction,
  TransferAmountTransactionStatus,
} from '../../rpc-scanning/rpc-scanning.interface';
import { HTTPGet, maxBy } from '@orbiter-finance/utils';
import dayjs from 'dayjs';

export class ZKSpaceApiScanningService extends ApiScanningService {
  // constructor(
  //   protected readonly chainId: string,
  //   protected chainConfigService: ChainConfigService,
  //   protected transactionService: TransactionService,
  // ) {
  //   super(chainId, chainConfigService, transactionService);
  // }
  async timedTetTransactions(address: string) {
    const prevTime = await this.getLastScannedPosition(address).then((data) => {
      return data ? +data : dayjs().subtract(60, 'minute').valueOf();
    });
    const transfers = await this.getPipeTransactions(
      address,
      async (datas: TransferAmountTransaction[]) => {
        const newTransfers = await this.filterTransfers(
          datas.filter((tx) => tx.timestamp >= prevTime),
        );
        this.logger.debug(
          `${this.chainId} timedTetTransactions address ${address},  ${dayjs(
            prevTime,
          ).format('YYYY-MM-DD HH:mm:ss')}  data total: ${datas.length} / ${
            newTransfers.length
          }`,
        );
        await this.transactionService.execCreateTransactionReceipt(
          newTransfers,
        );
      },
      prevTime,
    );
    if (transfers.length <= 0) {
      await this.setLastScannedPosition(address, prevTime.toString());
    } else if (transfers.length > 0) {
      const maxTransfer = maxBy(transfers, 'timestamp');
      await this.setLastScannedPosition(
        address,
        `${maxTransfer.timestamp + 1}`,
      );
    }
    return transfers;
  }
  async getPipeTransactions(
    address: string,
    callback: any,
    prevTime: number,
    offset = 0,
  ): Promise<TransferAmountTransaction[]> {
    // const transfers: TransferAmountTransaction[] = [];
    const { error, transfers, response } = await this.getTransactions(address, {
      types: 'Transfer',
      offset,
    });
    if (error) {
      throw error;
    }
    if (transfers.length > 0) {
      await callback(transfers);
      const pagination = response.data.pagination;
      offset = pagination.limit + pagination.start;
      const firstTx = transfers[transfers.length - 1];
      if (firstTx.timestamp > prevTime) {
        const result = await this.getPipeTransactions(
          address,
          callback,
          prevTime,
          offset,
        );
        transfers.push(...result);
      }
    }
    return transfers;
  }
  async getTransactions(
    address: string,
    params: any,
  ): Promise<{
    transfers: TransferAmountTransaction[];
    response: any;
    error?: any;
  }> {
    const chainConfig = this.chainConfigService.getChainInfo(this.chainId);
    const { offset, types } = params;
    const limit = 100;
    const url = `${chainConfig.api.url}/txs?start=${offset}&limit=${limit}&address=${address}&types=${types}`;
    const transfers: TransferAmountTransaction[] = [];
    let response;
    try {
      response = await HTTPGet(url);
      if (response && response.success) {
        const chainId = this.chainId;
        const data = response.data.data;
        for (const tx of data) {
          const token = tx.token;
          const transferData: TransferAmountTransaction = {
            chainId: String(chainId),
            hash: tx.tx_hash,
            blockNumber: tx.block_number,
            sender: tx.from,
            receiver: tx.to,
            value: '0',
            amount: tx.value,
            token: '',
            symbol: '',
            fee: '0',
            feeToken: '',
            feeAmount: tx.fee,
            timestamp: +(tx.created_at * 1000).toFixed(0),
            status: TransferAmountTransactionStatus.none,
            nonce: tx.nonce,
            receipt: tx,
          };
          const getTokenInfo = this.chainConfigService.getTokenBySymbol(
            chainId,
            token.symbol,
          );
          if (getTokenInfo) {
            transferData.symbol = getTokenInfo.symbol;
            transferData.token = getTokenInfo.address;
            transferData.value = new BigNumber(tx.value)
              .multipliedBy(10)
              .multipliedBy(getTokenInfo.decimals)
              .toFixed(0);
          }
          const feeTokenInfo = this.chainConfigService.getTokenByAddress(
            chainId,
            tx.fee_token,
          );
          if (feeTokenInfo) {
            transferData.value = new BigNumber(tx.fee)
              .multipliedBy(10)
              .multipliedBy(feeTokenInfo.decimals)
              .toFixed(0);
            transferData.feeToken = feeTokenInfo.symbol;
          }
          if (
            tx.status === 'verified' &&
            tx.success &&
            tx.tx_type == 'Transfer'
          ) {
            transferData.status = TransferAmountTransactionStatus.confirmed;
          } else if (tx.status === 'pending') {
            transferData.status = TransferAmountTransactionStatus.pending;
          } else {
            transferData.status = TransferAmountTransactionStatus.failed;
          }
          transfers.push(transferData);
        }
      }
      return { transfers, response };
    } catch (error) {
      return { transfers, response, error };
    }
  }
}
