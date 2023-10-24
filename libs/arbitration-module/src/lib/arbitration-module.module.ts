import { Module } from '@nestjs/common';
import { ArbitrationModuleService } from './arbitration-module.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ArbitrationJobService } from './arbitrationJob.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  controllers: [],
  providers: [ArbitrationJobService, ArbitrationModuleService],
  exports: [ArbitrationModuleService],
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot()
  ],
})
export class ArbitrationModule {}
