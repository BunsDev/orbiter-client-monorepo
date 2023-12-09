import { Controller } from '@nestjs/common';
import { Post, Body } from '@nestjs/common'
@Controller('/dealer/report')
export class ReportController {
    @Post('tx')
    index(@Body("hash") hash: string, @Body("channel") channel: string, @Body("desc") desc?: string) {
        return {
            hash,
            channel,
            desc
        }
    }
}
