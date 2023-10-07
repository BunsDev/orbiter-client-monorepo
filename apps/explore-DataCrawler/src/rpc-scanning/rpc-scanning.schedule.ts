import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ChainConfigService } from '@orbiter-finance/config';
import { ENVConfigService } from '@orbiter-finance/config';
import { RpcScanningScheduleService } from './rpc-scanning.interface';
import { RpcScanningFactory } from './rpc-scanning.factory';
import { isEmpty } from '@orbiter-finance/utils';
import { AlertService } from '@orbiter-finance/alert'
import { OrbiterLogger, LoggerDecorator } from '@orbiter-finance/utils';
@Injectable()
export class RpcScanningSchedule {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private scanService: Map<string, RpcScanningScheduleService> = new Map();
  constructor(
    private chainConfigService: ChainConfigService,
    private envConfigService: ENVConfigService,
    private rpcScanningFactory: RpcScanningFactory,
    private alertService: AlertService
  ) {
    this.initializeTransactionScanners();
  }
  private removeScanServiceById(chainId: string) {
    if (this.scanService.has(chainId)) {
      this.scanService.delete(chainId);
      this.logger.info(
        `change scan chain ${chainId} delete scan rpc service`,
      );
    }
  }
  @Interval(1000 * 10)
  private async initializeTransactionScanners() {
    const SCAN_CHAINS = (this.envConfigService.get<string>('SCAN_CHAINS') || '').split(',');
    const chains = this.chainConfigService.getAllChains();
    if (isEmpty(chains)) {
      this.logger.warn(`chains config empty`);
      return;
    }
    // this.logger.info(`chains: ${JSON.stringify(chains)}`);
    for (const chain of chains) {
      if (!chain.service) {
        this.logger.error(`${chain.name} service not config`);
        this.removeScanServiceById(chain.chainId);
        continue;
      }
      if (SCAN_CHAINS[0] != '*') {
        if (!SCAN_CHAINS.includes(chain.chainId)) {
          this.removeScanServiceById(chain.chainId);
          continue;
        }
      }

      const serviceKeys = Object.keys(chain.service);
      if (!serviceKeys.includes('rpc')) {
        this.removeScanServiceById(chain.chainId);
        continue;
      }

      if (!this.scanService.has(chain.chainId)) {
        const scanner = this.rpcScanningFactory.createService(chain.chainId);
        this.scanService.set(chain.chainId, {
          id: chain.chainId,
          type: 'rpc',
          mutex: new Mutex(),
          reScanMutex: new Mutex(),
          service: scanner,
        });
        this.logger.info(
          `CREATE RPC SCAN SERVICE ${chain.name}`,
        );
        this.alertService.sendMessage(`CREATE RPC SCAN SERVICE ${chain.name}`, 'TG')
      }
    }
    this.checkLatestHeight();
  }
  @Interval(1000)
  executeCrawlBlock() {
    if (Date.now() % 30 === 0) {
      if (this.scanService.size <= 0) {
        this.logger.warn('RPC chain scanning service not created');
      }
    }

    for (const scanner of this.scanService.values()) {
      if (scanner.reScanMutex.isLocked()) {
        continue;
      }
      scanner.reScanMutex.runExclusive(async () => {
        scanner.service.logger.info(`rpc scan executeCrawlBlock start`)
        await scanner.service.executeCrawlBlock().catch(error => {
          this.logger.error(
            `executeCrawlBlock error `,
            error,
          );
        })

      });
    }
  }
  @Interval(1000)
  private async checkLatestHeight() {
    for (const scanner of this.scanService.values()) {
      try {
        if (scanner.mutex.isLocked()) {
          continue;
        }
        scanner.mutex.runExclusive(async () => {
          // scanner.service.logger.info(`rpc scan scanSchedule start`)
          const result = await scanner.service.checkLatestHeight().catch((error) => {
            this.logger.error(
              `rpc scan bootstrap error`,
              error,
            );
          })
          // scanner.service.logger.info(`rpc scan scanSchedule end ${JSONStringify(result)}`)
          return result;
        })
      } catch (error) {
        this.logger.error(
          `scanSchedule checkLatestHeight error`,
          error,
        );
      }
    }
  }
}
