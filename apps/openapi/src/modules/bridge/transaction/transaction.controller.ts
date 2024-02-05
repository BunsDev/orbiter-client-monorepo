import { LoggerDecorator } from '@orbiter-finance/utils';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { Controller, Get, Param, Req } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';

@Controller('transaction')
export class TransactionController {
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/cross-chain/:hash")
    @success('success', 200)
    async queryCrossChainTransaction(@Param("hash") hash: string, @Req() request: Request) {
        this.logger.info(`queryCrossChainTransaction ip:${request['ip']}， hash:${hash}`)
        const transaction = await this.transactionService.getCrossChainTransaction(hash);
        return transaction
    }
    @Get("/status/:hash")
    @success('success', 200)
    async queryTransaction(@Param("hash") hash: string, @Req() request: Request) {
        this.logger.info(`queryTransaction ip:${request['ip']}， hash:${hash}`)
        const transaction = await this.transactionService.getTransferByHash(hash);
        return transaction
    }

}
