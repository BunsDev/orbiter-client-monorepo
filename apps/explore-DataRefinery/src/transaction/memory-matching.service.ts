import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BridgeTransactionAttributes, TransfersAttributes } from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { equals } from '@orbiter-finance/utils';

@Injectable()
export class MemoryMatchingService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private maxTimeMS = 1000 * 60 * 20;
  private transfersID: { [key: string]: Set<string> } = {}; // version hash
  public transfers: TransfersAttributes[] = [];
  //
  private bridgeTransactionsID: { [key: string]: Set<string> } = {}; // version
  private bridgeTransactions: BridgeTransactionAttributes[] = [];
  @Cron('*/10 * * * * *')
  async fromCacheMatch() {
    for (let i = this.transfers.length - 1; i >= 0; i--) {
      const transfer = this.transfers[i];
      const txTimeMs = dayjs(transfer.timestamp).valueOf();
      if (Date.now() - txTimeMs > this.maxTimeMS) {
        this.transfers.splice(i, 1);
        if (this.transfersID[transfer.version]) {
          this.transfersID[transfer.version].delete(transfer.hash);
        }
      }
    }
    for (let i = this.bridgeTransactions.length - 1; i >= 0; i--) {
      const transfer = this.bridgeTransactions[i];
      const txTimeMs = dayjs(transfer.sourceTime).valueOf();
      if (Date.now() - txTimeMs > this.maxTimeMS) {
        this.bridgeTransactions.splice(i, 1);
        if (this.bridgeTransactionsID[transfer.version]) {
          this.bridgeTransactionsID[transfer.version].delete(transfer.sourceId);
        }
      }
    }
    console.log(
      `fromCacheMatch transfers:${this.transfers.length}, bridgeTransactions:${this.bridgeTransactions.length}`,
    );
  }

  matchV1GetBridgeTransactions(transfer: TransfersAttributes) {
    // const toHashTx = this.bridgeTransactions.find(bt => bt.targetId == transfer.hash && bt.targetChain == transfer.chainId);
    // if (toHashTx) {
    //   return toHashTx;
    // }
    const matchTx = this.bridgeTransactions.find((bt) => {
      const responseMaker: string[] = bt.responseMaker || [];

      if(['loopring','loopring_test'].includes(bt.targetChain)) {
        return (
          transfer?.calldata && (transfer as any).calldata.length &&
          equals(bt.targetNonce, transfer.calldata[0]) &&
          equals(bt.targetSymbol, transfer.symbol) &&
          equals(bt.targetAddress, transfer.receiver) &&
          equals(bt.targetChain, transfer.chainId) &&
          equals(bt.targetAmount, transfer.amount) &&
          dayjs(transfer.timestamp).valueOf() > dayjs(bt.sourceTime).valueOf() &&
          responseMaker.includes(transfer.sender) &&

          bt.version === `${transfer.version.split('-')[0]}-0`
        )
      }
      return (
        equals(bt.targetSymbol, transfer.symbol) &&
        equals(bt.targetAddress, transfer.receiver) &&
        equals(bt.targetChain, transfer.chainId) &&
        equals(bt.targetAmount, transfer.amount) &&
        dayjs(transfer.timestamp).valueOf() > dayjs(bt.sourceTime).valueOf() &&
        responseMaker.includes(transfer.sender) &&

        bt.version === `${transfer.version.split('-')[0]}-0`
      );
    });
    if (!matchTx) {
      return null;
    }
    return matchTx;
  }

  addTransferMatchCache(instance: TransfersAttributes) {
    return new Promise((resove, reject) => {
      try {
        const txTimeMs = dayjs(instance.timestamp).valueOf();
        if (Date.now() - txTimeMs > this.maxTimeMS) {
          return resove(false);
        }
        if (instance.status != 2) {
          return resove(false);
        }
        if (!this.transfersID[instance.version]) {
          this.transfersID[instance.version] = new Set();
        }
        if (!this.transfersID[instance.version].has(instance.hash)) {
          this.transfersID[instance.version].add(instance.hash);
          this.transfers.unshift(instance);
        }
        resove(true);
      } catch (error) {
        reject(error);
      }
    });
  }
  addBridgeTransaction(instance: BridgeTransactionAttributes) {
    return new Promise((resove, reject) => {
      try {
        const txTimeMs = dayjs(instance.sourceTime).valueOf();
        if (Date.now() - txTimeMs > this.maxTimeMS) {
          return resove(false);
        }
        if (instance.targetId) {
          return resove(false);
        }
        if (![0, 97, 98].includes(instance.status)) {
          return resove(false);
        }
        if (!this.bridgeTransactionsID[instance.version]) {
          this.bridgeTransactionsID[instance.version] = new Set();
        }
        if (
          !this.bridgeTransactionsID[instance.version].has(instance.sourceId)
        ) {
          this.bridgeTransactionsID[instance.version].add(instance.sourceId);
          this.bridgeTransactions.unshift(instance);
        }
        resove(true);
      } catch (error) {
        reject(error);
      }
    });
  }
  removeBridgeTransaction(hash: string) {
    const index = this.bridgeTransactions.findIndex(
      (tx) => tx.sourceId == hash,
    );
    const transfer = this.bridgeTransactions[index];
    if (index >= 0 && transfer) {
      this.bridgeTransactions.splice(index, 1);
      if (this.bridgeTransactionsID[transfer.version]) {
        this.bridgeTransactionsID[transfer.version].delete(hash);
      }
    }
  }
  removeTransferMatchCache(hash: string) {
    const index = this.transfers.findIndex((tx) => tx.hash == hash);
    const transfer = this.transfers[index];
    if (index >= 0 && transfer) {
      this.transfers.splice(index, 1);
      if (this.transfersID[transfer.version]) {
        this.transfersID[transfer.version].delete(hash);
      }
    }
  }
}
