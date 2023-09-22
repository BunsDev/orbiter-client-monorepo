import { Mutex } from 'async-mutex';
import { ApiScanningService } from './api-scanning.service';
import { ChainConfigService } from '@orbiter-finance/config';
import { TransactionService } from '../transaction/transaction.service';

export interface ApiScanning { }

export interface ApiScanningScheduleService {
  id: string;
  type: string;
  mutex: Mutex;
  service: ApiScanningService;
}

export interface Context {
  chainConfigService: ChainConfigService,
  transactionService: TransactionService
}