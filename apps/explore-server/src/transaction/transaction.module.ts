import { Module } from '@nestjs/common';
import { TransactionService } from '../transaction/transaction.service';

@Module({
    providers: [TransactionService],
    exports: [TransactionService]
})
export class TransactionModule {

}
