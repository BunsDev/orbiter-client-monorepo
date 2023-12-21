import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionV1Service } from './transactionV1.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction, DeployRecord } from '@orbiter-finance/seq-models';
import { TransactionV2Service } from './transactionV2.service';
import { TransactionV3Service } from './transactionV3.service';
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

import InscriptionBuilder, { InscriptionStandardBuilder } from './inscription.builder'
import { InscriptionMemoryMatchingService } from './inscription-memory-matching.service'
@Module({
  imports: [SequelizeModule.forFeature([Transfers, BridgeTransaction, DeployRecord]), MakerModule],
  providers: [
    InscriptionBuilder,
    InscriptionStandardBuilder,
    InscriptionMemoryMatchingService,
    BridgeTransactionBuilder,
    TransactionV3Service,
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
  exports: [TransactionService, TransactionV1Service, TransactionV2Service, TransactionV3Service],
})
export class TransactionModule {}
