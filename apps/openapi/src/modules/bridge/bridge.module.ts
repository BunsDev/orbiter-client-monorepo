import { Module } from '@nestjs/common';
import { ChainsController } from './chains/chains.controller';
import { TokensController } from './chains/tokens.controller';
import { RoutersController } from './routers/routers.controller';
import { ChainsService } from './chains/chains.service';
import { RoutersService } from './routers/routers.service';
import { TransactionController } from './transaction/transaction.controller';
import { TransactionService } from './transaction/transaction.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Transfers, BridgeTransaction, RefundRecord } from '@orbiter-finance/seq-models';
import { TokenService } from './chains/token.service';

@Module({
    imports:[
        SequelizeModule.forFeature([Transfers, BridgeTransaction,RefundRecord], 'bridge'),
    ],
    controllers: [ChainsController, TokensController, RoutersController, TransactionController],
    providers: [ChainsService, RoutersService, TransactionService, TokenService],
})
export class BridgeModule {

}
