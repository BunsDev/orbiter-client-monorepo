import { Injectable } from '@nestjs/common';
import { ENVConfigService } from 'libs/config/src/lib/env-config.service'
@Injectable()
export class AlertService {
    constructor(readonly envConfigService: ENVConfigService,) {
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
        const telegram:any = await this.envConfigService.getAsync("TELEGRAM");
        if (!telegram) {
            throw new Error('telegram config not');
        }
        const url = `https://api.telegram.org/bot${telegram.token}/sendMessage`;
        const data = {
            chat_id: telegram.chatId,
            text: message,
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                console.log('Alert sent successfully');
            } else {
                console.error('Failed to send alert');
            }
        } catch (error) {
            console.error('Error sending alert:', error);
        }
    }
}
