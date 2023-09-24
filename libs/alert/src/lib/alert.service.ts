import { Inject, Injectable } from '@nestjs/common';
import { HTTPGet, HTTPPost } from '@orbiter-finance/utils'
import { AlertModuleOpts } from './alert.module';
export enum AlertMessageChannel {
    TG = 'TG',
    EMAIL = 'EMAIL',
    SMS = 'SMS'
}
@Injectable()
export class AlertService {
    constructor(
        @Inject("AlertModuleOpts") private readonly opts: AlertModuleOpts,) {
    }
    async sendMessage(message: string, channels?: AlertMessageChannel[] | AlertMessageChannel | string | string[]) {
        if (!channels) {
            channels = Object.values<any>(MessageChannel);
        }
        if (!Array.isArray(channels)) {
            channels = [channels];
        }

        if (channels.includes(AlertMessageChannel.TG)) {
            this.sendTelegram('', message);
        }
        if (channels.includes(AlertMessageChannel.EMAIL)) {
            this.sendEmail(message);
        }
        if (channels.includes(AlertMessageChannel.SMS)) {
            this.sendEmail(message);
        }
    }
    async sendSMS(message: string) {
        if (!this.opts.sms) {
            throw new Error('SMS Config not found')
        }
        const Key = this.opts.sms?.token;
        const smsMob = this.opts.sms.phoneNumbers.join(',')
        if (!Key || !smsMob) {
            return console.error('Missing configuration for sending short message notification');
        }
        const query = {
            Uid: this.opts.sms.uid,
            Key,
            smsMob,
            smsText: message,
        }
        const rest = await HTTPGet(this.opts.sms.host, query);
        return rest;
    }
    async sendEmail(message: string) {


    }
    async sendTelegram(level: string, message: string) {
        if (!this.opts.telegram) {
            throw new Error('telegram config not');
        }
        const url = `https://api.telegram.org/bot${this.opts.telegram.token}/sendMessage`;
        const data = {
            chat_id: this.opts.telegram.chatId,
            text: `${level}-${message}`,
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
