import { Mutex } from 'async-mutex';
import { ApiScanningService } from './api-scanning.service';
import { ChainConfigService } from '@orbiter-finance/config';
import { MdcService } from '../thegraph/mdc/mdc.service';
import { TransactionService } from '../transaction/transaction.service';
import { MakerService } from '../maker/maker.service'
export interface ApiScanning { }

export interface ApiScanningScheduleService {
  id: string;
  type: string;
  mutex: Mutex;
  service: ApiScanningService;
}

export interface Context {
  chainConfigService: ChainConfigService,
  transactionService: TransactionService,
  mdcService: MdcService,
  makerService: MakerService,
}