import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionV1Service } from './transactionV1.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction } from '@orbiter-finance/seq-models';
import { TransactionV2Service } from './transactionV2.service';
import { MemoryMatchingService } from './memory-matching.service';
import {MakerModule} from '../maker/maker.module'
import
BridgeTransactionBuilder,
{
  StandardBuilder,
  EVMOBSourceContractBuilder,
  EVMRouterV1ContractBuilder,
  EVMRouterV3ContractBuilder,
  StarknetOBSourceContractBuilder,
  LoopringBuilder,
  ZksyncLiteBuilder,
}
from './bridgeTransaction.builder';
@Module({
  imports: [SequelizeModule.forFeature([Transfers, BridgeTransaction]), MakerModule],
  providers: [
    BridgeTransactionBuilder,
    TransactionV2Service,
    TransactionV1Service,
    TransactionService,
    MemoryMatchingService,
    StandardBuilder,
    EVMOBSourceContractBuilder,
    EVMRouterV1ContractBuilder,
    EVMRouterV3ContractBuilder,
    StarknetOBSourceContractBuilder,
    LoopringBuilder,
    ZksyncLiteBuilder,
  ],
  exports: [TransactionService, TransactionV1Service, TransactionV2Service],
})
export class TransactionModule {}
