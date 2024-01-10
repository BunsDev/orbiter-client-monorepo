import { Controller, Get, Query } from '@nestjs/common';

import { AppService } from './app.service';
import { TransactionService } from './transaction.service';
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly transactionService: TransactionService,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('/manualSync')
  async manualSyncTransfer(@Query() queryParams: { hash: string }) {
    const { hash } = queryParams;
    const result = await this.transactionService.syncTransferByHash(hash)
    return { data: result, code: 'ok' };
  }
}
