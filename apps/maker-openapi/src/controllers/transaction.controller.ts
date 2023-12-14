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
}
