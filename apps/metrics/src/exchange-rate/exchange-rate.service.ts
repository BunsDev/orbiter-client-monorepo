import { Injectable } from '@nestjs/common';
import coinbaseRate from '../assets/rates.json'
@Injectable()
export class ExchangeRateService {
    public rates: { [key: string]: string } = coinbaseRate.rates;
    public ratesCurrency: string = coinbaseRate.currency;
    async conversion(amount: number, fromSymbol: string, toSymbol: string) {
        const ratesItem = this.rates;
        let value: undefined | number = undefined;
        const ratesCurrency = this.ratesCurrency;
        await this.fillMantleRate(fromSymbol, toSymbol, ratesItem);
        await this.fillBSCRate(fromSymbol, toSymbol, ratesItem);
        if (ratesCurrency != 'USDT') {
            throw new Error('Only supports USDT base exchange rate calculation')
        }

        if (ratesCurrency == fromSymbol) {
            const rate = ratesItem[toSymbol];
            if (rate) {
                value = amount * +rate;
            }
        } else if (ratesCurrency == toSymbol) {
            const rate1 = ratesItem[fromSymbol];
            if (rate1) {
                value = amount * (1 / +rate1);
            }
        } else {
            const fromSymbolRate = await this.conversion(1, 'USDT', fromSymbol);
            const toSymbolRate = await this.conversion(1, 'USDT', toSymbol);
            console.debug(`USDT TO ${fromSymbol} = ${fromSymbolRate}`);
            console.debug(`USDT TO ${toSymbol} = ${toSymbolRate}`);
            if (fromSymbolRate && toSymbolRate) {
                value = amount * (1 / fromSymbolRate) * toSymbolRate;
            }
        }
        if (value === undefined) {
            throw new Error(`Exchange rate not supported ${fromSymbol}-${toSymbol}`);
        }
        return +value;
    }
    async fillMantleRate(source: string, dest: string, rates: any) {
        rates['MNT'] = 0.4;
        return rates;
    }
    private USDTTOBNBRate:string|number = 0;
    async fillBSCRate(source: string, dest: string, rates: any) {
        rates['BNB'] = 200;
        return rates
        fetch('https://www.binance.com/api/v3/depth?symbol=BNBUSDT&limit=1').then(res=> {
            const data = res.json();
            this.USDTTOBNBRate = data['bids'][0][0];
        });
        if(this.USDTTOBNBRate) {
            rates['BNB'] = +this.USDTTOBNBRate;
        }
        return rates;
    }
}
