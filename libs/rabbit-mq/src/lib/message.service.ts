// message.service.ts
import { Injectable } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { JSONStringify } from '@orbiter-finance/utils';

@Injectable()
export class MessageService {
  constructor(private readonly connectionManager: RabbitmqConnectionManager) {}

  async sendTransactionReceiptMessage(data: any) {
    const queue = 'TransactionReceipt';
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      return await channel.sendToQueue(queue, Buffer.from(JSONStringify(data)));
    } catch (error) {
      console.error('Failed to send message:', (error as any).message);
      throw error;
    }
  }
  async sendTransferMatchMessage(data: any) {
    const queue = 'TransferWaitMatch';
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      const result = await channel.sendToQueue(
        queue,
        Buffer.from(JSONStringify(data)),
      );
      if (data.version === '1-0' || data.version === '2-0') {
        const makerTransferWaitMatchQueue = 'makerTransferWaitMatch'
        await channel.assertQueue(makerTransferWaitMatchQueue);
        await channel.sendToQueue(
          makerTransferWaitMatchQueue,
          Buffer.from(JSONStringify(data)),
        );
      }
      return result;
    } catch (error) {
      console.error('Failed to send message:', (error as any).message);
      throw error;
    }
  }
  async sendMessage(queue: string, message: string) {
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      await channel.sendToQueue(queue, Buffer.from(message));
    } catch (error) {
      console.error('Failed to send message:', (error as any).message);
    }
  }
}
