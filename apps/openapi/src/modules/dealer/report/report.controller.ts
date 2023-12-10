import { Controller, ValidationPipe } from '@nestjs/common';
import { Post, Body } from '@nestjs/common'
import { ReportService } from './report.service';
import { ReportTransactionDto } from './report.dto';
@Controller('/dealer/report')
export class ReportController {
    constructor(private readonly reportService: ReportService) {

    }
    @Post('tx')
    async reportTransaction(@Body() reportTransaction: ReportTransactionDto) {
        const transaction = await this.reportService.reportTransaction(reportTransaction.chainId, reportTransaction.hash, reportTransaction.channel, reportTransaction.description)
        return transaction;
    }
}
