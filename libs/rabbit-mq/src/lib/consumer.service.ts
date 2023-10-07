// consumer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { Message } from 'amqplib';
import { AlertService } from '@orbiter-finance/alert';
import { sleep } from '@orbiter-finance/utils';
@Injectable()
export class ConsumerService {
  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    private alertService: AlertService
  ) {
  }
  async consumeScanTransferReceiptMessages(callback: (data: any) => Promise<any>) {
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeScanTransferReceiptMessages(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      channel.on('close', () => {
        Logger.error('Channel closed');
        this.alertService.sendMessage('Channel closed', 'TG');
        this.consumeScanTransferReceiptMessages(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`Channel error:${err.message}`, 'TG');
      });

      const queue = 'TransactionReceipt';
      await channel.assertQueue(queue);
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            await callback(data);
            channel.ack(msg);
          } catch (error: any) {
            Logger.error(`consumeTransactionReceiptMessages Error ${error.message}`, error);
            channel.nack(msg);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeScanTransferReceiptMessages(callback);
      Logger.error(`consumeScanTransferReceiptMessages error ${error.message}`, error);
    }
  }

  async consumeScanTransferSaveDBAfterMessages(callback: (data: any) => Promise<any>) {
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeScanTransferSaveDBAfterMessages(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      const queue = 'TransferWaitMatch';
      await channel.assertQueue(queue);
      channel.on('close', () => {
        Logger.error('Channel closed');
        this.alertService.sendMessage(`${queue} Channel closed`, 'TG');
        this.consumeScanTransferSaveDBAfterMessages(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`${queue} Channel error:${err.message}`, 'TG');
      });
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            const result = await callback(data);
            Logger.log(`consumeScanTransferSaveDBAfterMessages result ${data.hash} ${JSON.stringify(result)}`)
            channel.ack(msg);
          } catch (error: any) {
            Logger.error(`consumeScanTransferSaveDBAfterMessages Error processing message:${error.message}`, error)
            channel.reject(msg);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeScanTransferSaveDBAfterMessages(callback);
      Logger.error(`consumeScanTransferSaveDBAfterMessages error ${error.message}`, error);
    }

  }

  async consumeMakerWaitTransferMessage(callback: (data: any) => Promise<any>) {
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeMakerWaitTransferMessage(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      const queue = 'makerWaitTransfer';
      await channel.assertQueue(queue);
      channel.on('close', () => {
        Logger.error('Channel closed');
        this.alertService.sendMessage(`${queue} Channel closed`, 'TG');
        this.consumeMakerWaitTransferMessage(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`${queue} Channel error:${err.message}`, 'TG');
      });
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            await callback(data);
            channel.ack(msg);
          } catch (error: any) {
            console.error(
              `consumeTransferWaitMessages Error processing message: ${error.message}`,
              error,
            );
            channel.reject(msg);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeMakerWaitTransferMessage(callback);
      Logger.error(`consumeMakerWaitTransferMessage error ${error.message}`, error);
    }
  }
}
