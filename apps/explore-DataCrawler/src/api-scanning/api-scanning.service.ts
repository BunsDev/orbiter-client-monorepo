import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { Mutex } from 'async-mutex';
import winston from 'winston';
import { ethers } from 'ethers6';
import { TransferAmountTransaction } from '../transaction/transaction.interface';
import { Context } from './api-scanning.interface';
import { equals, logger } from '@orbiter-finance/utils'

export class ApiScanningService {
  protected logger: winston.Logger;
  private lock = new Mutex();

  private prevExecute = {
    time: Date.now(),
    fail: [],
    state: {},
  };

  constructor(
    protected readonly chainId: string,
    protected readonly ctx: Context,
  ) {
    this.logger = logger.createLoggerByName(`APIScan-${this.chainId}`);
  }

  // Get chain configuration
  protected get chainConfig() {
    return this.ctx.chainConfigService.getChainInfo(this.chainId);
  }


  // Process transactions
  protected async processTransaction(
    transfers: TransferAmountTransaction[],
  ): Promise<TransferAmountTransaction[]> {
    await this.ctx.transactionService.handleTransfer(transfers);
    return transfers;
  }

  // Get the list of addresses to scan
  protected async getScanAddressList(): Promise<string[]> {
    return this.ctx.transactionService.getWatchAddress();
  }

  // Get a list of valid EVM addresses to scan
  protected async getScanEVMAddressList(): Promise<string[]> {
    const addressList: string[] = await this.ctx.transactionService.getWatchAddress();
    return addressList.filter(ethers.isAddress);
  }

  // Bootstrap the scanning process
  public async bootstrap() {
    const ownerList = await this.getScanAddressList();
    const interval = Date.now() - this.prevExecute.time;

    for (const addr of ownerList) {
      try {
        await this.timedTetTransactions(addr);
        this.prevExecute.state[addr] = Date.now();
        const index = this.prevExecute.fail.findIndex((failedAddr) =>
          equals(failedAddr, addr),
        );
        this.prevExecute.fail.splice(index, 1);

        if (interval >= 6000 * 2) {
          this.chainConfig.debug && this.logger.debug(
            `${addr} - Previous scan time: ${JSON.stringify(
              this.prevExecute.state[addr],
            )}`,
          );
          this.prevExecute.time = Date.now();
        }
      } catch (error) {
        this.prevExecute.fail.push(addr);
        this.logger.error(`${addr} - API scan error`, error);
      }
    }
  }

  // Filter valid transfers from a list of transactions
  protected async filterTransfers(transfers: TransferAmountTransaction[]): Promise<TransferAmountTransaction[]> {
    const newList: TransferAmountTransaction[] = [];

    for (const transfer of transfers) {
      const senderValid = await this.ctx.transactionService.isWatchAddress(transfer.sender);

      if (senderValid) {
        newList.push(transfer);
        continue;
      }

      const receiverValid = await this.ctx.transactionService.isWatchAddress(transfer.receiver);

      if (receiverValid) {
        newList.push(transfer);
      }
    }

    return newList;
  }

  // Get a token by its ID
  protected getToken(id: number | string) {
    return this.ctx.chainConfigService.getTokenByChain(this.chainId, id);
  }

  // Set the last scanned position
  protected async setLastScannedPosition(prefix: string, position: string): Promise<void> {
    return await this.lock.runExclusive(async () => {
      const directory = `runtime/api-scan`;
      if (!existsSync(directory)) {
        mkdirSync(directory);
      }
      return await writeFileSync(`${directory}/${prefix}-${this.chainId}`, position)
    });
  }

  // Get the last scanned position
  protected async getLastScannedPosition(prefix: string): Promise<string> {
    try {
      const position = await readFileSync(`runtime/api-scan/${prefix}-${this.chainId}`);
      return position && position.toString();
    } catch (error) {
      this.logger.error('getLastScannedPosition error', error);
      this.setLastScannedPosition(prefix, '');
    }
    return '';
  }

  // Generate data for the last scanned position
  protected generateLastScannedPositionData(
    _transfers: TransferAmountTransaction[],
  ): string {
    throw new Error(
      `${this.chainId} - generateLastScannedPositionData not implemented`,
    );
  }

  // Timed transactions scanning
  protected async timedTetTransactions(_address: string): Promise<TransferAmountTransaction[]> {
    throw new Error(`${this.chainId} - ApiScan not implemented`);
  }

  // Get transactions
  public getTransactions(
    _address: string,
    _params: any,
  ): Promise<{
    transfers: TransferAmountTransaction[];
    response: any;
    error?: any;
  }> {
    throw new Error(`${this.chainId} - ApiScan not implemented`);
  }

  // Manually scan blocks
  public manualScanBlocks(_params: any) {
    throw new Error(`${this.chainId} - manualScanBlocks not implemented`);
  }
}
