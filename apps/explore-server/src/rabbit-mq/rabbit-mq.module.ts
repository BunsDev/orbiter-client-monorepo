import { Module, Global } from '@nestjs/common';
import { MessageService } from './message.service';
import { RabbitmqConnectionManager } from './rabbitmq-connection.manager';
import { ConsumerService } from './consumer.service';
import { TransactionModule } from '../transaction/transaction.module';
import { ENVConfigService } from '@orbiter-finance/config';
@Global()
@Module({
  imports: [TransactionModule],
  providers: [
    ENVConfigService,
    RabbitmqConnectionManager,
    MessageService,
    ConsumerService,
  ],
  exports: [MessageService],
})
export class RabbitMqModule {}
