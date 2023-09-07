// rabbitmq-connection.manager.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, Connection, Channel } from 'amqplib';
import { createLoggerByName } from '../utils/logger';
import { ENVConfigService } from '@orbiter-finance/config';
@Injectable()
export class RabbitmqConnectionManager
  implements OnModuleInit, OnModuleDestroy
{
  private connection: Connection;
  private channel: Channel;
  private logger = createLoggerByName(RabbitmqConnectionManager.name);
  constructor(private readonly envConfigService: ENVConfigService) {
    this.connectToRabbitMQ();
  }

  async onModuleInit() {
    // await this.connectToRabbitMQ();
  }

  async onModuleDestroy() {
    await this.closeConnection();
  }

  private async connectToRabbitMQ() {
    try {
      // RABBITMQ_URL
      const url = await this.envConfigService.getAsync<string>('RABBITMQ_URL');
      this.connection = await connect(url);
      this.connection.on('error', (error) => {
        this.logger.error('RabbitMQ connection error:', error.message);
      });
      this.connection.on('close', () => {
        this.logger.warn(
          'RabbitMQ connection closed. Attempting to reconnect...',
        );
        setTimeout(() => this.connectToRabbitMQ(), 5000);
      });
      this.channel = await this.connection.createChannel();
      this.logger.info('Connected to RabbitMQ');
    } catch (error) {
      this.logger.error(
        `Failed to connect to RabbitMQ:${error.message}`,
        error.stack,
      );
      process.exit(1);
      // setTimeout(() => this.connectToRabbitMQ(), 5000);
    }
  }

  private async closeConnection() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
      this.logger.info('Disconnected from RabbitMQ');
    }
  }
  async createChannel(): Channel {
    return await this.connection.createChannel();
  }
  getChannel(): Channel {
    return this.channel;
  }
}
