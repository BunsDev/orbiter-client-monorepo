import { Module } from '@nestjs/common';
import { DealerController } from './dealer.controller';
import { DealerService } from './dealer.service';
import { ReportService } from './report/report.service';
import { ReportController } from './report/report.controller';

@Module({
  controllers: [DealerController, ReportController],
  providers: [DealerService, ReportService]
})
export class DealerModule {}
