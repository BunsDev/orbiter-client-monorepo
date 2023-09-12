import { ChainConfigService } from '@orbiter-finance/config';
import { TransferAmountTransaction } from '../rpc-scanning/rpc-scanning.interface';
import { readFileSync, outputFile } from 'fs-extra';
import { TransactionService } from '../transaction/transaction.service';
import { MdcService } from '../thegraph/mdc/mdc.service';
import { equals, uniq } from '@orbiter-finance/utils';
import { Mutex } from 'async-mutex';
import { createLoggerByName } from '../utils/logger';
import winston from 'winston';
import { IChainConfig } from '@orbiter-finance/config'
import { Context } from './api-scanning.interface'
export class ApiScanningService {
  protected logger: winston.Logger;
  private lock = new Mutex();

  protected prevExecute = {
    time: Date.now(),
    fail: [],
    state: {},
  };
  constructor(
    protected readonly chainId: string,
    protected readonly ctx: Context,
  ) {
    this.logger = createLoggerByName(`API-${this.chainId}`);
    this.init();
  }
  get chainConfig(): IChainConfig {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }
  async init() {
    console.log('init');
  }
  async getScanAddressList() {
    const ownerList = uniq([
      ...this.prevExecute.fail,
      ...(await this.ctx.makerService.getWhiteWalletAddress()),
    ]);
    return ownerList;
  }
  async bootstrap() {
    const ownerList = await this.getScanAddressList();
    const interval = Date.now() - this.prevExecute.time;
    for (const addr of ownerList) {
      try {
        await this.timedTetTransactions(addr);
        this.prevExecute.state[addr] = Date.now();
        const index = this.prevExecute.fail.findIndex((addr) =>
          equals(addr, addr),
        );
        this.prevExecute.fail.splice(index, 1);
        if (interval >= 6000 * 2) {
          this.logger.debug(
            `${addr} prev scan time ${JSON.stringify(
              this.prevExecute.state[addr],
            )}`,
          );
          this.prevExecute.time = Date.now();
        }
      } catch (error) {
        this.prevExecute.fail.push(addr);
        this.logger.error(`${addr} scan error ${error.message}`, error.stack);
      }
    }
  }
  protected async filterTransfers(transfers: TransferAmountTransaction[]) {
    const newList = [];
    for (const transfer of transfers) {
      const senderValid = await this.ctx.makerService.isWhiteWalletAddress(transfer.sender)
      if (senderValid.exist) {
        // transfer.version = senderValid.version;
        newList.push(transfer);
        continue;
      }
      const receiverValid = await this.ctx.makerService.isWhiteWalletAddress(transfer.receiver)

      if (receiverValid.exist) {
        // transfer.version = receiverValid.version;
        newList.push(transfer);
        continue;
      }
    }
    return newList;
  }

  getToken(id: number | string) {
    return this.ctx.chainConfigService.getTokenByChain(this.chainId, id);
  }

  protected async setLastScannedPosition(
    prefix: string,
    position: string,
  ): Promise<void> {
    return await this.lock.runExclusive(async () => {
      return await outputFile(
        `runtime/api-scan/${prefix}-${this.chainId}`,
        position,
      );
    });
  }

  protected async getLastScannedPosition(prefix: string): Promise<string> {
    try {
      const position = readFileSync(
        `runtime/api-scan/${prefix}-${this.chainId}`,
      );
      return position && position.toString();
    } catch (error) {
      this.logger.error('getLastScannedPosition error', error.stack);
      this.setLastScannedPosition(prefix, '');
    }
    return '';
  }
  generateLastScannedPositionData(
    _transfers: TransferAmountTransaction[],
  ): string {
    throw new Error(
      `${this.chainId} generateLastScannedPositionData not implemented`,
    );
  }
  timedTetTransactions(_address: string): Promise<TransferAmountTransaction[]> {
    throw new Error(`${this.chainId} ApiScan not implemented`);
  }
  getTransactions(
    _address: string,
    _params: any,
  ): Promise<{
    transfers: TransferAmountTransaction[];
    response: any;
    error?: any;
  }> {
    throw new Error(`${this.chainId} ApiScan not implemented`);
  }
  manualScanBlocks(_params: any) {
    throw new Error(`${this.chainId} manualScanBlocks not implemented`);
  }
}
