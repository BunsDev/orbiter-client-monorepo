import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BridgeTransactionAttributes, TransfersAttributes} from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { createLoggerByName } from '../utils/logger';

@Injectable()
export class MemoryMatchingService {
  private logger = createLoggerByName(`${MemoryMatchingService.name}`);
  private maxTimeMS = 1000 * 60 * 10;
  private transfersID: { [key: string]: Set<string> } = {}; // version hash
  private transfers: TransfersAttributes[] = [];
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
      } else {
        if (transfer.version === '1-1') {
          const matchTx = this.matchV1GetBridgeTransactions(transfer);
          if (matchTx) {
            this.logger.info(
              `for match tx: source hash:${matchTx.sourceId}，dest hash:${
                transfer.hash
              }, ${JSON.stringify(matchTx)}`,
            );
          }
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
    if (transfer.version != '1-1') {
      throw new Error('Target Tx Incorrect version');
    }
    const matchTx = this.bridgeTransactions.find((bt) => {
      const responseMaker: string[] = bt.responseMaker || [];
      return (
        equals(bt.targetSymbol, transfer.symbol) &&
        equals(bt.targetAddress, transfer.receiver) &&
        equals(bt.targetChain, transfer.chainId) &&
        equals(bt.targetAmount, transfer.amount) &&
        responseMaker.includes(transfer.sender) &&
        bt.version === '1-0'
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
