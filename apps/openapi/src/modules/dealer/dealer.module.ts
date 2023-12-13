import { Module } from '@nestjs/common';
import { DealerController } from './dealer.controller';
import { DealerService } from './dealer.service';
import { ReportService } from './report/report.service';
import { ReportController } from './report/report.controller';
import TransactionSource from '../../models/TransactionSource.model';
import { SequelizeModule } from '@nestjs/sequelize';
@Module({
  imports: [SequelizeModule.forFeature([TransactionSource], 'stats')],
  controllers: [DealerController, ReportController],
  providers: [DealerService, ReportService]
})
export class DealerModule { }
