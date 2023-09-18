import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ChainConfigService } from '@orbiter-finance/config';
import { ENVConfigService } from '@orbiter-finance/config';
import { RpcScanningScheduleService } from './rpc-scanning.interface';
import { RpcScanningFactory } from './rpc-scanning.factory';
import { JSONStringify, isEmpty } from '@orbiter-finance/utils';
import { createLoggerByName } from '../utils/logger';
import { AlertService } from '@orbiter-finance/alert'
import { ConfigService } from '@nestjs/config';
@Injectable()
export class RpcScanningSchedule {
  private readonly logger = createLoggerByName(RpcScanningSchedule.name);
  private scanService: Map<string, RpcScanningScheduleService> = new Map();
  constructor(
    private chainConfigService: ChainConfigService,
    private envConfigService: ENVConfigService,
    private rpcScanningFactory: RpcScanningFactory,
    private alertService: AlertService,
    private configSercie: ConfigService,
  ) {
    this.initializeTransactionScanners();
  }
  @Cron('*/5 * * * * *')
  private async initializeTransactionScanners() {
    const SCAN_CHAINS = (
      this.configSercie.get('SCAN_CHAINS') || this.envConfigService.get<string>('SCAN_CHAINS')
    ).split(',');
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
              `change scan chain ${chain.chainId}-${chain.name} delete scan rpc service`,
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
      if (!serviceKeys.includes('rpc')) {
        if (this.scanService.has(chain.chainId)) {
          this.scanService.delete(chain.chainId);
          this.logger.info(
            `change service ${chain.chainId}-${chain.name} delete scan rpc service`,
          );
        }
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
        // this.alertService.sendTelegramAlert("INFO", `CREATE RPC SCAN SERVICE ${chain.name}`)
      }
    }
    this.scanSchedule();
  }
  @Cron('*/1 * * * * *')
  failedREScanSchedule() {
    for (const scanner of this.scanService.values()) {
      if (scanner.reScanMutex.isLocked()) {
        continue;
      }
      scanner.reScanMutex.runExclusive(async () => {
        scanner.service.logger.info(`rpc scan failedREScanSchedule start`)
        const result: any = await scanner.service.retryFailedREScanBatch().catch(error => {
          this.logger.error(
            `failedREScanSchedule failedREScan error `,
            error,
          );
        })
        if (result) {
          for (const row of result) {
            if (row && row.block) {
              scanner.service.logger.info(`failedREScanSchedule scan scanSchedule end ${row.block['number']} / transfers: ${row['transfers'].length}`)
            } else {
              scanner.service.logger.error(`failedREScanSchedule error ${JSONStringify(row || {})}`)
            }
          }
        }

      });
    }
  }
  private async scanSchedule() {
    for (const scanner of this.scanService.values()) {
      try {
        if (scanner.mutex.isLocked()) {
          continue;
        }
        scanner.mutex.runExclusive(async () => {
          // scanner.service.logger.info(`rpc scan scanSchedule start`)
          const result = await scanner.service.bootstrap().catch((error) => {
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
          `scanSchedule bootstrap error`,
          error,
        );
      }
    }
  }
}
