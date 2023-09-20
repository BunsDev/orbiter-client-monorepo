// message.service.ts
import { Injectable } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { JSONStringify } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
@Injectable()
export class MessageService {
  constructor(private readonly connectionManager: RabbitmqConnectionManager) { }

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
      return result;
    } catch (error) {
      console.error('Failed to send message:', (error as any).message);
      throw error;
    }
  }

  async sendTransferToMakerClient(data: BridgeTransactionAttributes) {
    const queue = 'makerWaitTransfer'
    if (data.version != '2-0') {
      return;
    }
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      const result = await channel.sendToQueue(
        queue,
        Buffer.from(JSONStringify(data)),
      );
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
