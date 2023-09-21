import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ChainConfigService } from '@orbiter-finance/config';
import { isEmpty } from '@orbiter-finance/utils';
import { ApiScanningFactory } from './api-scanning.factory';
import { ApiScanningScheduleService } from './api-scanning.interface';
import { ENVConfigService } from '@orbiter-finance/config';
import { createLoggerByName } from '../utils/logger';
import { AlertService } from '@orbiter-finance/alert';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class ApiScanningSchedule {
  private readonly logger = createLoggerByName(ApiScanningSchedule.name);
  private scanService: Map<string, ApiScanningScheduleService> = new Map();
  constructor(
    private chainConfigService: ChainConfigService,
    private envConfigService: ENVConfigService,
    private apiScanningFactory: ApiScanningFactory,
    private alertService: AlertService,
    private configSercie: ConfigService,
  ) {
    this.initializeTransactionScanners();
  }
  @Cron('*/10 * * * * *')
  private async initializeTransactionScanners() {
    const SCAN_CHAINS = (
      this.configSercie.get('SCAN_CHAINS') || this.envConfigService.get<string>('SCAN_CHAINS')
    )||''.split(',');
    const chains = this.chainConfigService.getAllChains();
    if (isEmpty(chains)) {
      return;
    }
    for (const chain of chains) {
      if (SCAN_CHAINS[0] != '*') {
        if (!SCAN_CHAINS.includes(chain.chainId)) {
          if (this.scanService.has(chain.chainId)) {
            this.scanService.delete(chain.chainId);
            this.logger.info(
              `change scan chain ${chain.chainId}-${chain.name} delete scan api service`,
            );
          }
          continue;
        }
      }
      if (!chain.service) {
        this.logger.error(`${chain.name} service not register`);
        continue;
      }
      const serviceKeys = Object.keys(chain.service);
      if (!serviceKeys.includes('api')) {
        if (this.scanService.has(chain.chainId)) {
          this.scanService.delete(chain.chainId);
          this.logger.info(
            `change service chain ${chain.chainId}-${chain.name} delete scan api service`,
          );
        }
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
        // this.alertService.sendTelegramAlert("INFO", `CREATE RPC SCAN SERVICE ${chain.name}`)
      }
    }
    this.start();
  }

  private async start() {
    for (const scanner of this.scanService.values()) {
      if (scanner.mutex) {
        await scanner.mutex.runExclusive(async () => {
          return await scanner.service.bootstrap().catch((error) => {
            this.logger.error(
              `scan bootstrap error ${error.message}`,error
            );
          });
        });
      }
    }
  }
}
