import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { MdcService } from '../thegraph/mdc/mdc.service';
import { ThegraphManagerService } from '../thegraph/manager/manager.service';
import { TransactionV1Service } from './transactionV1.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { TransactionV2Service } from './transactionV2.service';
import { MemoryMatchingService } from './memory-matching.service';
@Module({
  imports: [SequelizeModule.forFeature([Transfers, BridgeTransaction])],
  providers: [
    ThegraphManagerService,
    TransactionV2Service,
    TransactionV1Service,
    MdcService,
    TransactionService,
    MemoryMatchingService,
  ],
  exports: [TransactionService, TransactionV1Service, TransactionV2Service],
})
export class TransactionModule {}
