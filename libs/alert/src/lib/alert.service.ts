import { Inject, Injectable } from '@nestjs/common';
import {HTTPPost} from '@orbiter-finance/utils'
import { AlertModuleOpts } from './alert.module';
@Injectable()
export class AlertService {
    constructor(
        @Inject("AlertModuleOpts") private readonly opts:AlertModuleOpts,) {
    }
    //   async sendTelegramAlert(botToken: string, chatId: string, message: string) {
    //     const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    //     const data = {
    //       chat_id: chatId,
    //       text: message,
    //     };

    //     try {
    //       const response = await fetch(url, {
    //         method: 'POST',
    //         headers: {
    //           'Content-Type': 'application/json',
    //         },
    //         body: JSON.stringify(data),
    //       });

    //       if (response.ok) {
    //         console.log('Alert sent successfully');
    //       } else {
    //         console.error('Failed to send alert');
    //       }
    //     } catch (error) {
    //       console.error('Error sending alert:', error);
    //     }
    //   }
    async sendTelegramAlert(level:string, message: string) {
        if (!this.opts.telegram) {
            throw new Error('telegram config not');
        }
        const url = `https://api.telegram.org/bot${this.opts.telegram.token}/sendMessage`;
        const data = {
            chat_id: this.opts.telegram.chatId,
            text:`${level}-${message}`,
        };

        try {
            const response = await HTTPPost(url, data);
            if (response) {
                console.log('Alert sent successfully');
            } else {
                console.error('Failed to send alert');
            }
        } catch (error) {
            console.error(`Error sending alert ${message}:`, error);
        }
    }
}
