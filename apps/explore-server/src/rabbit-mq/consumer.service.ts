// consumer.service.ts
import { Injectable } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { Message } from 'amqplib';
import { TransactionService } from '../transaction/transaction.service';
import { createLoggerByName } from '../utils/logger'
import { AlertService } from '@orbiter-finance/alert';
@Injectable()
export class ConsumerService {
  private logger = createLoggerByName(`${ConsumerService.name}`);
  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    private transactionService: TransactionService,
    private alertService: AlertService
  ) {
    const time = setInterval(() => {
      const channel = this.connectionManager.getChannel();
      if (channel) {
        this.consumeTransferWaitMessages();
        this.consumeTransactionReceiptMessages();
        clearInterval(time);
      }
    });
  }
  async consumeTransactionReceiptMessages() {
    const channel = await this.connectionManager.createChannel();
    channel.on('close', () => {
      this.logger.error('Channel closed');
      this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
      this.consumeTransferWaitMessages()
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
          await this.transactionService.batchInsertTransactionReceipt(data);
          channel.ack(msg);
        } catch (error) {
          console.error(
            'consumeTransactionReceiptMessages Error processing message:',
            error.message,
          );
        }
      }
    });
  }
  async consumeTransferWaitMessages() {
    const channel = await this.connectionManager.createChannel();
    const queue = 'TransferWaitMatch';
    await channel.assertQueue(queue);
    channel.on('close', () => {
      this.logger.error('Channel closed');
      this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
      this.consumeTransferWaitMessages()
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
          await this.transactionService.executeMatch(data);
          channel.ack(msg);
        } catch (error) {
          console.error(
            'consumeTransferWaitMessages Error processing message:',
            error.message,
          );
        }
      }
    });
  }
}
