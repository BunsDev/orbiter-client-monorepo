import { Mutex } from 'async-mutex';
import { ApiScanningService } from './api-scanning.service';
export interface ApiScanning {}

export interface ApiScanningScheduleService {
  id: string;
  type: string;
  mutex: Mutex;
  service: ApiScanningService;
}
