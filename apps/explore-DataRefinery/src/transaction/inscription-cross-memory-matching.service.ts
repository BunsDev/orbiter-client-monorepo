import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BridgeTransactionAttributes, TransfersAttributes } from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { equals } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService, MakerV1RuleService, Token, IChainConfig } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
@Injectable()
export class InscriptionCrossMemoryMatchingService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private maxTimeMS = 1000 * 60 * 20;
  private transfersID: { [key: string]: Set<string> } = {}; // version hash
  public transfers: TransfersAttributes[] = [];
  protected chainConfigService: ChainConfigService;
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
      `InscriptionCrossMemoryMatchingService fromCacheMatch transfers:${this.transfers.length}, bridgeTransactions:${this.bridgeTransactions.length}`,
    );
  }

  matchV3GetBridgeTransactions(transfer: TransfersAttributes, sourceChainInfo: IChainConfig) {
    // const toHashTx = this.bridgeTransactions.find(bt => bt.targetId == transfer.hash && bt.targetChain == transfer.chainId);
    // if (toHashTx) {
    //   return toHashTx;
    // }
    const callData = transfer.calldata as any;
    const { tick, amt } = callData;
    const matchTx = this.bridgeTransactions.find((bt) => {
      const responseMaker: string[] = bt.responseMaker || [];

      return (
        equals(bt.sourceChain, sourceChainInfo.chainId) &&
        equals(bt.targetAddress, transfer.receiver) &&
        equals(new BigNumber(bt.targetAmount).toFixed(0), new BigNumber(amt).toFixed(0)) &&
        equals(bt.targetChain, transfer.chainId) &&
        equals(bt.targetSymbol, tick) &&
        equals(bt.sourceNonce, transfer.value) &&
        dayjs(transfer.timestamp).valueOf() > (dayjs(bt.sourceTime).valueOf() - 1000 * 60) &&
        responseMaker.includes(transfer.sender) &&
        bt.version === `${transfer.version.split('-')[0]}-3`
      );
    });
    if (!matchTx) {
      return null;
    }
    return matchTx;
  }

  addTransferMatchCache(instance: TransfersAttributes) {
    return new Promise((resolve, reject) => {
      try {
        const txTimeMs = dayjs(instance.timestamp).valueOf();
        if (Date.now() - txTimeMs > this.maxTimeMS) {
          return resolve(false);
        }
        if (instance.status != 2) {
          return resolve(false);
        }
        if (!this.transfersID[instance.version]) {
          this.transfersID[instance.version] = new Set();
        }
        if (!this.transfersID[instance.version].has(instance.hash)) {
          this.transfersID[instance.version].add(instance.hash);
          this.transfers.push(instance);
        }
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  }
  addBridgeTransaction(instance: BridgeTransactionAttributes) {
    return new Promise((resolve, reject) => {
      try {
        const txTimeMs = dayjs(instance.sourceTime).valueOf();
        if (Date.now() - txTimeMs > this.maxTimeMS) {
          return resolve(false);
        }
        if (instance.targetId) {
          return resolve(false);
        }
        if (![0, 97, 98].includes(instance.status)) {
          return resolve(false);
        }
        if (!this.bridgeTransactionsID[instance.version]) {
          this.bridgeTransactionsID[instance.version] = new Set();
        }
        if (
          !this.bridgeTransactionsID[instance.version].has(instance.sourceId)
        ) {
          this.bridgeTransactionsID[instance.version].add(instance.sourceId);
          this.bridgeTransactions.push(instance);
        }
        resolve(true);
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
