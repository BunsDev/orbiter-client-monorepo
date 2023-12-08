import { Controller, Get, Post } from '@nestjs/common';

@Controller('dealer/report')
export class ReportController {
    @Post()
    index() {
        return 'ok';
    }
}
