import { Controller, Get, ValidationPipe } from '@nestjs/common';
import { Post, Body } from '@nestjs/common'
import { ReportService } from './report.service';
import { ReportTransactionDto } from './report.dto';
import { success } from 'apps/openapi/src/shared/decorators/responser.decorator';
@Controller('dealer')
export class ReportController {
    constructor(private readonly reportService: ReportService) {

    }
    @Get()
    @success('success')
    async index() {
      return 'ok';
    }
    @Post('/report/tx')
    @success('success')
    async reportTransaction(@Body() reportTransaction: ReportTransactionDto) {
        const transaction = await this.reportService.reportTransaction(reportTransaction.chainId, reportTransaction.hash, reportTransaction.channel, reportTransaction.description)
        return transaction;
    }
}
