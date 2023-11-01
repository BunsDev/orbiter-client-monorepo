import { Module } from '@nestjs/common';
import { ArbitrationService } from './arbitration.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ArbitrationJobService } from './arbitrationJob.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  controllers: [],
  providers: [ArbitrationJobService, ArbitrationService],
  exports: [],
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot()
  ],
})
export class ArbitrationModule { }
