import { ApiScanningService } from '../api-scanning.service';
import BigNumber from 'bignumber.js';

import { ImmutableX, Config } from '@imtbl/core-sdk';
import dayjs from 'dayjs';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
import { Context } from '../api-scanning.interface';

export class ImmutableApiScanningService extends ApiScanningService {
  private client: ImmutableX;

  constructor(
    protected readonly chainId: string,
    protected readonly ctx: Context,
  ) {
    super(chainId, ctx)
    const chainConfig = this.chainConfig;
    if (+chainConfig.networkId == 1) {
      this.client = new ImmutableX(Config.PRODUCTION);
    } else {
      this.client = new ImmutableX(Config.SANDBOX);
    }
  }
  async getScanAddressList() {
    return await super.getScanEVMAddressList();
  }
  async timedTetTransactions(
    address: string,
  ): Promise<TransferAmountTransaction[]> {
    try {
      const user = await this.client.getUser(address);
      if (!(user && user.accounts.length > 0)) {
        return [];
      }
    } catch (error) {
        // this.logger.error(
        //   `${address} getAccount error`,
        //   error,
        // );
      return [];
    }

    const transfers: TransferAmountTransaction[] = [];
    const cachePosition = (await this.getLastScannedPosition(address)) || '';
    let [senderPosition, receiverPosition] = cachePosition.split('/');
    if (!senderPosition) {
      senderPosition = `0_${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
    }
    if (!receiverPosition) {
      receiverPosition = `0_${dayjs().format('YYYY-MM-DD HH:mm:ss')}`;
    }
    try {
      const senderTransfers = await this.getTransactionsBySender(
        senderPosition,
        address,
      );
      if (senderTransfers.length > 0) {
        const newTransfers = await this.filterTransfers(senderTransfers);
        await this.processTransaction(newTransfers);
        senderPosition = this.generateLastScannedPositionData(newTransfers);
        transfers.push(...newTransfers);
      }
    } catch (error) {
      this.logger.error(
        `${address} getTransactionsBySender error`,
        error,
      );
    }
    try {
      const receiverTransfers = await this.getTransactionsByReceiver(
        receiverPosition,
        address,
      );
      if (receiverTransfers.length > 0) {
        const newTransfers = await this.filterTransfers(receiverTransfers);
        const result = await this.processTransaction(newTransfers);
        transfers.push(...newTransfers);
        receiverPosition = this.generateLastScannedPositionData(newTransfers);
      }
    } catch (error) {
      this.logger.error(
        `${address} getTransactionsByReceiver error`,
        error,
      );
    }
    await this.setLastScannedPosition(
      address,
      `${senderPosition}/${receiverPosition}`,
    );
    return transfers;
  }
  generateLastScannedPositionData(
    transfers: TransferAmountTransaction[],
  ): string {
    const transfer = transfers[transfers.length - 1];
    return `${transfer.blockNumber}_${dayjs(transfer.timestamp).format(
      'YYYY-MM-DD HH:mm:ss',
    )}`;
  }
  public timestampToNonce(timestamp: number | string) {
    let nonce = 0;
    if (timestamp) {
      timestamp = String(timestamp);
      const match = timestamp.match(/(\d{3})$/i);
      if (match && match.length > 1) {
        nonce = Number(match[1]) || 0;
      }
      if (nonce > 900) {
        nonce = nonce - 100;
      }
    }
    return nonce;
  }
  async getTransactionsBySender(position: string, address: string) {
    const [_id, time] = position.split('_');
    const timestamp = dayjs(time).toISOString();
    const params = {
      pageSize: 1000,
      orderBy: 'created_at',
      direction: 'asc',
      user: address,
      minTimestamp: timestamp,
    };
    const result = await this.getTransactions(address, params);
    if (result.error) {
      throw result.error;
    }
    // transfers = transfers.filter(tx => tx.blockNumber > +id);
    const transfers = result.transfers.filter(
      (tx) => tx.timestamp > dayjs(time).valueOf(),
    );
    return transfers;
  }

  async getTransactionsByReceiver(position: string, address: string) {
    const [_id, time] = position.split('_');
    const timestamp = dayjs(time).toISOString();
    const params = {
      pageSize: 1000,
      orderBy: 'created_at',
      direction: 'asc',
      receiver: address,
      minTimestamp: timestamp,
    };
    const result = await this.getTransactions(address, params);
    if (result.error) {
      throw result.error;
    }
    // transfers = transfers.filter(tx => tx.blockNumber > +id);
    const transfers = result.transfers.filter(
      (tx) => tx.timestamp > dayjs(time).valueOf(),
    );
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
    let response;
    // const params = {
    //     pageSize: 1000,
    //     orderBy: 'created_at',
    //     direction: 'asc',
    //     receiver: address,
    //     minTimestamp: timestamp
    // }
    const transfers: TransferAmountTransaction[] = [];
    try {
      response = await this.client.listTransfers(params);
      for (const item of response.result) {
        const value = new BigNumber(item.token.data.quantity);
        const decimals = item.token.data.decimals;
        const tokenInfo = await this.ctx.chainConfigService.getTokenBySymbol(
          this.chainId,
          item.token.type,
        );
        const transferTx: TransferAmountTransaction = {
          chainId: String(this.chainId),
          hash: `imx:${item.transaction_id}`,
          blockNumber: item.transaction_id,
          sender: item.user,
          receiver: item.receiver,
          value: value.toFixed(0),
          amount: value.div(Math.pow(10, decimals)).toString(),
          token: tokenInfo && tokenInfo.address,
          symbol: item.token.type,
          fee: '0',
          feeAmount: '0',
          feeToken: '',
          timestamp: dayjs(item.timestamp).valueOf(),
          status: TransferAmountTransactionStatus.failed,
          nonce: this.timestampToNonce(dayjs(item.timestamp).valueOf()),
          receipt: item,
        };
        if (['success', 'confirmed', 'accepted'].includes(item.status)) {
          transferTx.status = TransferAmountTransactionStatus.confirmed;
        }
        transfers.push(transferTx);
      }
      return { transfers, response };
    } catch (error) {
      return { transfers, error, response };
    }
  }
}
