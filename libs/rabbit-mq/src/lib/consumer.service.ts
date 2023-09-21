// consumer.service.ts
import { Injectable, Inject, Logger, LoggerService } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { Message } from 'amqplib';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AlertService } from '@orbiter-finance/alert';
import { sleep } from '@orbiter-finance/utils';
@Injectable()
export class ConsumerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
    private readonly connectionManager: RabbitmqConnectionManager,
    private alertService: AlertService
  ) {
  }
  async consumeScanTransferReceiptMessages(callback: (data: any) => Promise<any>) {
    try {
      const channel = await this.connectionManager.createChannel();
      channel.on('close', () => {
        this.logger.error('Channel closed');
        this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
        this.consumeScanTransferReceiptMessages(callback)
      });

      channel.on('error', (err) => {
        this.logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendTelegramAlert('ERROR', `Channel error:${err.message}`);
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
            // await this.transactionService.batchInsertTransactionReceipt(data);
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`consumeTransactionReceiptMessages Error ${error.message}`, error);
            channel.nack(msg);
          }
        }
      });
    } catch (error) {
      await sleep(500);
      this.consumeScanTransferReceiptMessages(callback);
      this.logger.error(`consumeScanTransferReceiptMessages error `, error);
    }

  }

  async consumeScanTransferSaveDBAfterMessages(callback: (data: any) => Promise<any>) {
    try {
      const channel = await this.connectionManager.createChannel();
      const queue = 'TransferWaitMatch';
      await channel.assertQueue(queue);
      channel.on('close', () => {
        this.logger.error('Channel closed');
        this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
        this.consumeScanTransferSaveDBAfterMessages(callback)
      });

      channel.on('error', (err) => {
        this.logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendTelegramAlert('ERROR', `Channel error:${err.message}`);
      });
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            const result = await callback(data);
            this.logger.log(`consumeScanTransferSaveDBAfterMessages result ${data.hash} ${JSON.stringify(result)}`)
            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(`consumeScanTransferSaveDBAfterMessages Error processing message:${error.message}`, error)
            channel.nack(msg);
          }
        }
      });
    } catch (error) {
      await sleep(500);
      this.consumeScanTransferSaveDBAfterMessages(callback);
      this.logger.error(`consumeScanTransferSaveDBAfterMessages catch error `, error);
    }

  }

  async consumeMakerWaitTransferMessage(callback: (data: any) => Promise<any>) {
    try {
      const channel = await this.connectionManager.createChannel();
      const queue = 'makerWaitTransfer';
      await channel.assertQueue(queue);
      channel.on('close', () => {
        this.logger.error('Channel closed');
        this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
        this.consumeMakerWaitTransferMessage(callback)
      });

      channel.on('error', (err) => {
        this.logger.error(`Channel error:${err.message}`, err.stack);
        this.alertService.sendTelegramAlert('ERROR', `Channel error:${err.message}`);
      });
      channel.prefetch(10);
      channel.consume(queue, async (msg: Message | null) => {
        if (msg) {
          try {
            const messageContent = msg.content.toString();
            const data = JSON.parse(messageContent);
            // await this.transactionService.executeMatch(data);
            await callback(data);
            channel.ack(msg);
          } catch (error: any) {
            console.error(
              'consumeTransferWaitMessages Error processing message:',
              error,
            );
            channel.nack(msg);
          }
        }
      });
    } catch (error) {
      await sleep(500);
      this.consumeMakerWaitTransferMessage(callback);
      this.logger.error(`consumeMakerWaitTransferMessage error `, error);
    }
  }
}
