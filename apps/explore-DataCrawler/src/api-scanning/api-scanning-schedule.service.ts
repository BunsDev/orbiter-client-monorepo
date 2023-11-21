import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ChainConfigService } from '@orbiter-finance/config';
import { isEmpty } from '@orbiter-finance/utils';
import { ApiScanningFactory } from './api-scanning.factory';
import { ApiScanningScheduleService } from './api-scanning.interface';
import { ENVConfigService } from '@orbiter-finance/config';
import { AlertService } from '@orbiter-finance/alert';
import { OrbiterLogger, LoggerDecorator } from '@orbiter-finance/utils';
@Injectable()
export class ApiScanningSchedule {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private scanService: Map<string, ApiScanningScheduleService> = new Map();
  constructor(
    private chainConfigService: ChainConfigService,
    private envConfigService: ENVConfigService,
    private apiScanningFactory: ApiScanningFactory,
    private alertService: AlertService
  ) {
    this.initializeTransactionScanners();
  }
  private removeScanServiceById(chainId: string) {
    if (this.scanService.has(chainId)) {
      this.scanService.delete(chainId);
      this.logger.info(
        `change scan chain ${chainId} delete scan api service`,
      );
    }
  }
  @Cron('*/10 * * * * *')
  private async initializeTransactionScanners() {
    const SCAN_CHAINS = (this.envConfigService.get<string>('SCAN_CHAINS') || '').split(',');
    const chains = this.chainConfigService.getAllChains();
    if (isEmpty(chains)) {
      return;
    }
    for (const chain of chains) {
      if (SCAN_CHAINS[0] != '*') {
        if (!SCAN_CHAINS.includes(chain.chainId)) {
          this.removeScanServiceById(chain.chainId)
          continue;
        }
      }
      if (!chain.service) {
        this.logger.error(`${chain.name} service not register`);
        continue;
      }
      const serviceKeys = Object.keys(chain.service);
      if (!serviceKeys.includes('api')) {
        this.removeScanServiceById(chain.chainId)
        continue;
      }

      if (!this.scanService.has(chain.chainId)) {
        const scanner = this.apiScanningFactory.createService(chain.chainId);
        this.scanService.set(chain.chainId, {
          id: chain.chainId,
          type: 'api',
          mutex: new Mutex(),
          service: scanner,
        });
        this.alertService.sendMessage(`CREATE API SCAN SERVICE ${chain.name}`, 'TG')
      }
    }
    this.execute();
  }

  private async execute() {
    if (Date.now() % 30 === 0) {
      if (this.scanService.size <= 0) {
        this.logger.warn('API chain scanning service not created');
      }
    }
    for (const scanner of this.scanService.values()) {
      if (scanner.mutex) {
        await scanner.mutex.runExclusive(async () => {
          return await scanner.service.bootstrap().catch((error) => {
            this.logger.error(
              `scan bootstrap error ${error.message}`, error
            );
          });
        });
      }
    }
  }
}
