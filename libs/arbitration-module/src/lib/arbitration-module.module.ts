import { Module } from '@nestjs/common';
import { ArbitrationService } from './arbitration.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ArbitrationJobService } from './arbitrationJob.service';

@Module({
  controllers: [],
  providers: [ArbitrationJobService, ArbitrationService],
  exports: [],
  imports: [
    ScheduleModule.forRoot()
  ],
})
export class ArbitrationModule {}
