import { Injectable } from '@nestjs/common';
import { writeFile } from 'fs';
import path from 'path';
export interface RateData {
    currency: string;
    rates: {
        [key: string]: string
    };
}
@Injectable()
export class CoinbaseService {
    async getUsdtExchangeRate(): Promise<RateData> {
        const currency = 'USDT';
        const url = `https://api.coinbase.com/v2/exchange-rates?currency=${currency}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json().then(res => res && res.data);
            if (data && data.currency === currency) {
                writeFile(path.join(__filename, '../assets/', "rates.json"), JSON.stringify(data), (...res) => {
                    console.log('save coinbase rate result:', res)
                });
            } else {
                console.log('request coinbase rate error:', data)
            }

            return data;
        } catch (error) {
            console.error(`Request coinbase rate Error: ${error}`);
            return null;
        }
    }
}
