import { TransactionService } from '../services/transaction.service';
import { HTTPResponse } from '../utils/Response';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
@Controller('transaction')
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/unreimbursedTransactions")
    async unreimbursedTransactions() {
        const { list } = await this.transactionService.getPendingArbitration();
        return HTTPResponse.success(list)
    }

    @Get("/pendingArbitration")
    async getPendingArbitration() {
        // user arbitration-client need
        return HTTPResponse.success(await this.transactionService.getPendingArbitration());
    }

    @Get("/status/:hash")
    async status(@Param("hash") hash: string) {
        if (!hash) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        const data = await this.transactionService.getSourceIdStatus(hash);
        return HTTPResponse.success(data);
    }

    @Post("/challenge")
    async submitChallenge(@Body() data: {
        sourceTxHash: string,
        challenger: string
    }) {
        if (!data?.sourceTxHash) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        await this.transactionService.submitChallenge(data);
        return HTTPResponse.success({ message: 'success' });
    }

    @Get("/challenge/:hash")
    async getChallenge(@Param("hash") hash: string) {
        if (!hash) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        return HTTPResponse.success(await this.transactionService.getChallenge(hash));
    }

    @Post("/record")
    async record(@Body() data: {
        sourceId: string,
        hash: string
    }) {
        if (!data?.sourceId || !data.hash) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        await this.transactionService.recordTransaction(data);
        return HTTPResponse.success({ message: 'success' });
    }

    @Get("/nextArbitration")
    async getNextArbitrationTx() {
        return HTTPResponse.success(await this.transactionService.getNextArbitrationTx());
    }
}
