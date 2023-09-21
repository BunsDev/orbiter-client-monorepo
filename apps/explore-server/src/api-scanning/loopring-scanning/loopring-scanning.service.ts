import { ApiScanningService } from '../api-scanning.service';
import BigNumber from 'bignumber.js';
import {
  TransferAmountTransaction,
  TransferAmountTransactionStatus,
} from '../../rpc-scanning/rpc-scanning.interface';
import { HTTPGet, maxBy } from '@orbiter-finance/utils';
import dayjs from 'dayjs';

export class LoopringApiScanningService extends ApiScanningService {
  private addressMapAccountId: Map<string, number> = new Map();
  async init() {
    this.addressMapAccountId = new Map();
    this.addressMapAccountId.set(
      '0x80c67432656d59144ceff962e8faf8926599bcf8',
      93994,
    );
    this.addressMapAccountId.set(
      '0xe4edb277e41dc89ab076a1f049f4a3efa700bce8',
      247112,
    );
    this.addressMapAccountId.set(
      '0xee73323912a4e3772B74eD0ca1595a152b0ef282',
      257010,
    );
  }
  async getAccountId(address: string) {
    address = address.toLocaleLowerCase();
    if (this.addressMapAccountId.has(address)) {
      return this.addressMapAccountId.get(address);
    }
    const chainConfig = this.chainConfig;
    const url = `${chainConfig.api.url}/account?owner=${address}`;
    const result: any = await HTTPGet(url);
    if (result && result.code) {
      throw new Error(result.message);
    }
    if (result && result.accountId) {
      this.addressMapAccountId.set(address, result.accountId);
      return result.accountId;
    }
    return null;
  }

  async timedTetTransactions(address: string) {
    const endTime = Date.now() - 1000;
    const position = await this.getLastScannedPosition(address).then((data) => {
      return data ? +data : dayjs().subtract(60, 'minute').valueOf();
    });
    const transfers = await this.getPipeTransactions(
      address,
      async (transfers: TransferAmountTransaction[]) => {
        const newTransfers = await this.filterTransfers(transfers);
        this.logger.debug(
          `${this.chainId} timedTetTransactions address ${address},  data total: ${transfers.length} / ${newTransfers.length}`,
        );
        const result =await this.handleScanBlockResult(newTransfers);
      },
      position,
      endTime,
    );

    if (transfers.length <= 0) {
      await this.setLastScannedPosition(address, endTime.toString());
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
    startTime = 0,
    endTime = Date.now(),
  ): Promise<TransferAmountTransaction[]> {
    // const transfers: TransferAmountTransaction[] = [];
    const { error, transfers, response } = await this.getTransactions(address, {
      types: 'TRANSFER',
      start: startTime,
      end: endTime,
    });
    if (error) {
      throw error;
    }
    if (transfers.length > 0) {
      await callback(transfers);
      endTime = transfers[transfers.length - 1].timestamp;
    }
    if (
      response &&
      Array.isArray(response.transactions) &&
      response.transactions.length < response.totalNum
    ) {
      const result = await this.getPipeTransactions(
        address,
        callback,
        startTime,
        endTime,
      );
      transfers.push(...result);
    }

    return transfers;
  }

  async getTransactions(
    address: string | number,
    params: any,
  ): Promise<{
    transfers: TransferAmountTransaction[];
    error?: any;
    response: any;
  }> {
    const chainConfig = this.ctx.chainConfigService.getChainInfo(this.chainId);
    let accountId = address;
    if (typeof address === 'string') {
      accountId = await this.getAccountId(address);
    }
    let response;
    const transfers: TransferAmountTransaction[] = [];
    const { types, start, end, limit } = params;
    try {
      const url = `${
        chainConfig.api.url
      }/user/transfers?accountId=${accountId}&types=${types}&start=${start}&end=${end}&limit=${
        limit || 50
      }`;
      response = await HTTPGet(url, {
        'x-api-key': chainConfig.api.key,
      });
      if (response && response.transactions) {
        for (const tx of response.transactions) {
          const value = new BigNumber(tx.amount);
          let amount = '0';
          let feeAmount = '0';
          const tokenInfo: any =
            (await this.ctx.chainConfigService.getTokenBySymbol(
              this.chainId,
              tx.symbol,
            )) || {};
          if (tokenInfo) {
            amount = value.div(Math.pow(10, tokenInfo.decimals)).toFixed();
          }
          const fee = new BigNumber(tx.feeAmount);
          const feeToken: any =
            (await this.ctx.chainConfigService.getTokenBySymbol(
              this.chainId,
              tx.feeTokenSymbol,
            )) || {};
          if (feeToken) {
            feeAmount = fee.div(Math.pow(10, feeToken.decimals)).toString();
          }
          const nonce = (tx.storageInfo.storageId - 1) / 2;
          const transferData: TransferAmountTransaction = {
            chainId: String(this.chainId),
            hash: tx.hash,
            blockNumber: tx.blockId,
            sender: tx.senderAddress,
            receiver: tx.receiverAddress,
            value: value.toFixed(0),
            amount: amount,
            token: String(tokenInfo.address),
            symbol: tx.symbol,
            fee: fee.toFixed(0),
            feeAmount: feeAmount,
            feeToken: tx.feeTokenSymbol,
            timestamp: tx.timestamp,
            status: TransferAmountTransactionStatus.failed,
            calldata: [tx.memo],
            nonce: nonce,
            receipt: tx,
          };
          if (tx.txType === 'TRANSFER' && tx.status === 'processed') {
            transferData.status = TransferAmountTransactionStatus.confirmed;
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
