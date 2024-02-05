import { LoggerDecorator } from '@orbiter-finance/utils';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { Controller, Get, Param, Req } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';
import * as RequestIp from '../../../utils/request-ip'
@Controller('transaction')
export class TransactionController {
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/cross-chain/:hash")
    @success('success', 200)
    async queryCrossChainTransaction(@Param("hash") hash: string, @Req() request: Request) {
        const headers = request['headers'];
        const ip = RequestIp.getClientIp(request);
        this.logger.info(`queryCrossChainTransaction ip:${ip}, headers: ${JSON.stringify(headers)}， hash:${hash}`)
        const transaction = await this.transactionService.getCrossChainTransaction(hash);
        return transaction
    }
    @Get("/status/:hash")
    @success('success', 200)
    async queryTransaction(@Param("hash") hash: string, @Req() request: Request) {
        const headers = request['headers'];
        const ip = RequestIp.getClientIp(request);
        this.logger.info(`queryTransaction ip:${ip}, headers: ${JSON.stringify(headers)}， hash:${hash}`)
        const transaction = await this.transactionService.getTransferByHash(hash);
        return transaction
    }

}
