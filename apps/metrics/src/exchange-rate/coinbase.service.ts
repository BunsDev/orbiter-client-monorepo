import { Injectable } from '@nestjs/common';
import { writeFile } from 'fs';
export interface RateData {
	currency: string;
	rates: {
        [key:string]:string
    };
}
@Injectable()
export class CoinbaseService {
    async getUsdtExchangeRate(): Promise<RateData> {
        const url = 'https://api.coinbase.com/v2/exchange-rates?currency=USDT';
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json().then(res => res && res.data);
            writeFile("../assets/rates.json", JSON.stringify(data), (...res)=> {
                console.log('save coinbase rate result:', res)
            });
            return data;
        } catch (error) {
            console.error(`Request coinbase rate Error: ${error}`);
            return null;
        }
    }
}
