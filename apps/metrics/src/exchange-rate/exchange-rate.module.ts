import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateTask } from './exchange-rate.task';
import { CoinbaseService } from './coinbase.service';

@Module({
  providers: [ExchangeRateService, ExchangeRateTask, CoinbaseService],
  exports: [ExchangeRateService]
})
export class ExchangeRateModule {}
