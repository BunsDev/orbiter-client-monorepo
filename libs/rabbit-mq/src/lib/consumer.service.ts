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
    const queue = 'TransactionReceipt';
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeScanTransferReceiptMessages(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      channel.on('close', () => {
        Logger.error(`${queue} Channel closed`);
        this.alertService.sendMessage('Channel closed', 'TG');
        this.consumeScanTransferReceiptMessages(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`${queue} Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`Channel error:${err.message}`, 'TG');
      });

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
            Logger.error(`${queue} consumeTransactionReceiptMessages Error ${error.message}`, error);
            channel.nack(msg);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeScanTransferReceiptMessages(callback);
      Logger.error(`${queue} consumeScanTransferReceiptMessages error ${error.message}`, error);
    }
  }

  async consumeDataSynchronizationMessages(callback: (data: any) => Promise<any>) {
    const queue = 'dataSynchronization';
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeDataSynchronizationMessages(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      channel.on('close', () => {
        Logger.error(`${queue} Channel closed`);
        this.alertService.sendMessage('Channel closed', 'TG');
        this.consumeDataSynchronizationMessages(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`${queue} Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`${queue} Channel error:${err.message}`, 'TG');
      });

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
            Logger.error(`${queue} consumeDataSynchronizationMessages Error ${error.message}`, error);
            channel.nack(msg,false,true);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeDataSynchronizationMessages(callback);
      Logger.error(`${queue} consumeDataSynchronizationMessages error ${error.message}`, error);
    }
  }

  async consumeScanTransferSaveDBAfterMessages(callback: (data: any) => Promise<any>) {
    const queue = 'TransferWaitMatch';
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeScanTransferSaveDBAfterMessages(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      await channel.assertQueue(queue);
      channel.on('close', () => {
        Logger.error(`${queue} Channel closed`);
        this.alertService.sendMessage(`${queue} Channel closed`, 'TG');
        this.consumeScanTransferSaveDBAfterMessages(callback)
      });

      channel.on('error', (err) => {
        Logger.error(`${queue} Channel error:${err.message}`, err.stack);
        this.alertService.sendMessage(`${queue} Channel error:${err.message}`, 'TG');
      });
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            const result = await callback(data);
            if (result && result.errno != 0) {
              Logger.log(`${queue} consumeScanTransferSaveDBAfterMessages result ${data.hash} ${JSON.stringify(result)}`)
            }
            channel.ack(msg);
          } catch (error: any) {
            Logger.error(`${queue} consumeScanTransferSaveDBAfterMessages Error processing message:${error.message}`, error)
            channel.nack(msg,true,false);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeScanTransferSaveDBAfterMessages(callback);
      Logger.error(`${queue} consumeScanTransferSaveDBAfterMessages error ${error.message}`, error);
    }

  }

  async consumeMakerWaitTransferMessage(callback: (data: any) => Promise<any>, afterPrefix:string= "") {
    const queue = `makerWaitTransfer${afterPrefix}`;
    try {
      if (!this.connectionManager.getChannel()) {
        await sleep(500);
        this.consumeMakerWaitTransferMessage(callback);
        return;
      }
      const channel = await this.connectionManager.createChannel();
      await channel.assertQueue(queue);
      channel.on('close', () => {
        Logger.error(`${queue} Channel closed`);
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
              `${queue} consumeTransferWaitMessages Error processing message: ${error.message}`,
              error,
            );
            channel.nack(msg,true,false);
            // channel.reject(msg);
          }
        }
      });
    } catch (error: any) {
      await sleep(500);
      this.consumeMakerWaitTransferMessage(callback);
      Logger.error(`${queue} consumeMakerWaitTransferMessage error ${error.message}`, error);
    }
  }
  
}
