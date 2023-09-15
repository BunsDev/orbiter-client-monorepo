// rabbitmq-connection.manager.ts
import { Inject, Injectable, LoggerService, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, Connection, Channel } from 'amqplib';
import { ENVConfigService } from '@orbiter-finance/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {AlertService} from '@orbiter-finance/alert'
@Injectable()
export class RabbitmqConnectionManager
  implements OnModuleInit, OnModuleDestroy
{
  private connection: Connection;
  private channel: Channel;
  private alertService: AlertService
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
    private readonly envConfigService: ENVConfigService) {
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
        this.alertService.sendTelegramAlert("ERROR",  `RabbitMQ connection error:${error.message}`);
        this.logger.error('RabbitMQ connection error:', error.message);
      });
      this.connection.on('close', () => {
        this.logger.warn(
          'RabbitMQ connection closed. Attempting to reconnect...',
        );
        this.alertService.sendTelegramAlert("ERROR", "RabbitMQ connection closed. Attempting to reconnect...");
        setTimeout(() => this.connectToRabbitMQ(), 5000);
      });
      this.channel = await this.connection.createChannel();
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.alertService.sendTelegramAlert("ERROR",  `Failed to connect to RabbitMQ:${error.message}`);
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
      this.alertService.sendTelegramAlert("ERROR",  'Disconnected from RabbitMQ');
      this.logger.log('Disconnected from RabbitMQ');
    }
  }
  async createChannel(): Promise<Channel> {
    return await this.connection.createChannel();
  }
  getChannel(): Channel {
    return this.channel;
  }
}
