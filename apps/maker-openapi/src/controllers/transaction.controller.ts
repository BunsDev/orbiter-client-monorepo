import { TransactionService } from '../services/transaction.service';
import { HTTPResponse } from '../utils/Response';
import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { registerMap } from "../utils/register";
import { aggregationLog } from "../utils/logger";
@Controller('transaction')
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {
    }
    @Get("/pendingArbitration")
    async getPendingArbitration(@Request() req) {
        // user arbitration-client need
        if (!registerMap[req.ip]) {
            aggregationLog(`getPendingArbitration ${req.ip} not registered`);
            return HTTPResponse.success({ list: [], startTime: 0, endTime: 0 });
        }
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
    async submitChallenge(@Request() req, @Body() data: {
        sourceTxHash: string,
        challenger: string
    }) {
        if (!data?.sourceTxHash) {
            return HTTPResponse.fail(1000, "Invalid parameters");
        }
        await this.transactionService.submitChallenge({ ...data, ip: req.ip });
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
