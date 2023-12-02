import { ExchangeRateService } from './exchange-rate.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CoinbaseService } from './coinbase.service';

@Injectable()
export class ExchangeRateTask {
  private readonly logger = new Logger(ExchangeRateTask.name);

  constructor(private readonly coinbaseService: CoinbaseService, private readonly exchangeRateService:ExchangeRateService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    console.log('oook')
    const usdtRate = await this.coinbaseService.getUsdtExchangeRate();
    if (usdtRate !== null && usdtRate.currency) {
      this.logger.log(`USDT Exchange Rate: ${usdtRate}`);
      this.exchangeRateService.rates = usdtRate.rates;
      this.exchangeRateService.ratesCurrency = usdtRate.currency;
    }
  }
}
