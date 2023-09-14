import { Module, Global } from '@nestjs/common';
import { MessageService } from './message.service';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { ConsumerService } from './consumer.service';
@Global()
@Module({
  imports: [],
  providers: [
    RabbitmqConnectionManager,
    MessageService,
    ConsumerService,
  ],
  exports: [MessageService,ConsumerService],
})
export class RabbitMqModule {}
