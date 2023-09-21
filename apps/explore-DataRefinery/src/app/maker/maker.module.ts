import { Module } from '@nestjs/common';
import { MakerService } from './maker.service';
import { MakerScheduuleService } from './maker.schedule'
import { ScheduleModule } from '@nestjs/schedule';
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MakerService, MakerScheduuleService],
  exports: [MakerService]
})
export class MakerModule { }
