// consumer.service.ts
import { Injectable,Inject, Logger,LoggerService } from '@nestjs/common';
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
  async consumeTransactionReceiptMessages(callback:(data:any) => Promise<any>) {
    while(true) {
      const channel = this.connectionManager.getChannel();
      if (channel) {
        // TAG： Waiting for optimization
        break;
      } else {
        await sleep(50)
      }
    }
    const channel = await this.connectionManager.createChannel();
    channel.on('close', () => {
      this.logger.error('Channel closed');
      this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
      this.consumeTransactionReceiptMessages(callback)
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
          this.logger.error(`consumeTransactionReceiptMessages Error ${error.message}`, error.stack);
        }
      }
    });
  }

  async consumeTransferWaitMessages(callback:(data:any) => Promise<any>) {
    while(true) {
      const channel = this.connectionManager.getChannel();
      if (channel) {
        // TODO:Waiting for optimization
        break;
      } else {
        await sleep(50)
      }
    }
    const channel = await this.connectionManager.createChannel();
    const queue = 'TransferWaitMatch';
    await channel.assertQueue(queue);
    channel.on('close', () => {
      this.logger.error('Channel closed');
      this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
      this.consumeTransferWaitMessages(callback)
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
            error.message,
          );
        }
      }
    });
  }

  async consumeBridgeTransactionMessages(callback:(data:any) => Promise<any>) {
    while(true) {
      const channel = this.connectionManager.getChannel();
      if (channel) {
        // TODO:Waiting for optimization
        break;
      } else {
        await sleep(50)
      }
    }
    const channel = await this.connectionManager.createChannel();
    const queue = 'makerTransferWaitMatch';
    await channel.assertQueue(queue);
    channel.on('close', () => {
      this.logger.error('Channel closed');
      this.alertService.sendTelegramAlert('ERROR', 'Channel closed');
      this.consumeBridgeTransactionMessages(callback)
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
        }
      }
    });
  }
}
