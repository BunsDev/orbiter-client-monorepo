import { TransactionService } from '../services/transaction.service';
import { HTTPResponse } from '../utils/Response';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
@Controller('transaction')
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/unreimbursedTransactions")
    async unreimbursedTransactions(@Query("startTime") startTime: string | number, @Query("endTime") endTime: string | number) {
        // user arbitration-client need
        startTime = +startTime;
        endTime = +endTime;
        if (!startTime) {
            return HTTPResponse.fail(1000, "startTime Missing parameters");
        }
        if (!endTime) {
            return HTTPResponse.fail(1000, "endTime Missing parameters");
        }

        if (startTime > endTime) {
            return HTTPResponse.fail(1000, "The start cannot be greater than the end time");
        }
        // if (dayjs(endTime).isAfter(dayjs(startTime).add(10,'day'))) {
        //     return HTTPResponse.fail(1000, "The end time cannot be greater than 10 days from the start time");
        // }
        const data = await this.transactionService.getUnreimbursedTransactions(+startTime, +endTime);
        return HTTPResponse.success(data)
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
        hash: string,
        type: number
    }) {
        if (!data?.sourceId || !data.hash || !data.type) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        await this.transactionService.recordTransaction(data);
        return HTTPResponse.success({ message: 'success' });
    }
}
