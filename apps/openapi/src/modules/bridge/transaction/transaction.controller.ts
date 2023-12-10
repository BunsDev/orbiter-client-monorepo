import { Controller, Get, Param } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';

@Controller('transaction')
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/cross-chain/:hash")
    @success('success', 200)
    async queryCrossChainTransaction(@Param("hash") hash: string) {
        const transaction = await this.transactionService.getCrossChainTransaction(hash);
        return transaction
    }
    @Get("/detail/:hash")
    @success('success', 200)
    async queryTransaction(@Param("hash") hash: string) {
        const transaction = await this.transactionService.getTransferByHash(hash);
        return transaction
    }

}
