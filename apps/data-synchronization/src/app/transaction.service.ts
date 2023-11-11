import { BridgeTransaction } from '@orbiter-finance/seq-models';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { BigIntToString } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { Transfers as TransfersModel } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { Cron } from '@nestjs/schedule';
import { LoggerDecorator } from '@orbiter-finance/utils';
@Injectable()
export class TransactionService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    private messageService: MessageService,
    private consumerService: ConsumerService
  ) {
    this.consumerService.consumeDataSynchronizationMessages(this.consumeDataSynchronizationMessages.bind(this))
    // TODO: Receive and process mq messages
    // TAG:data-synchronization
  }

  consumeDataSynchronizationMessages(bridgeTransaction: BridgeTransaction) {
    // TODO: convert struct save
  }
  @Cron('0 */1 * * * *')
  async syncV3V1FromDatabase() {
    // TODO: convert struct save
    const result = [];
    for (const row of result) {
      try {
      await this.consumeDataSynchronizationMessages(riw);
      } catch (error) {
          // TODO:
      }
    }
  }
}
