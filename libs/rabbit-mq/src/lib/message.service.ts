import { Logger } from '@nestjs/common';
// message.service.ts
import { Injectable } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { JSONStringify } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, Transfers } from '@orbiter-finance/seq-models';
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
      Logger.error('Failed to send message:', (error as any).message);
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
      Logger.error('Failed to send message:', (error as any).message);
      throw error;
    }
  }

  async sendTransferToMakerClient(data: BridgeTransactionAttributes) {
    const queue = 'makerWaitTransfer'
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      const result = await channel.sendToQueue(
        queue,
        Buffer.from(JSONStringify(data)),
      );
      return result;
    } catch (error) {
      Logger.error('Failed to send message:', (error as any).message);
      throw error;
    }
  }
  async sendMessageToDataSynchronization(data: { type: string; data: Transfers }) {
    const queue = 'dataSynchronization'
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      const result = await channel.sendToQueue(
        queue,
        Buffer.from(JSONStringify(data)),
      );
      return result;
    } catch (error) {
      Logger.error(`${queue} Failed to send message:`, (error as any).message);
      throw error;
    }
  }

  async sendMessage(queue: string, message: string) {
    const channel = this.connectionManager.getChannel();
    try {
      await channel.assertQueue(queue);
      await channel.sendToQueue(queue, Buffer.from(message));
    } catch (error) {
      Logger.error('Failed to send message:', (error as any).message);
    }
  }
}
