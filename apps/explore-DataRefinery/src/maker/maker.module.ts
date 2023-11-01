import { Module } from '@nestjs/common';
import { MakerService } from './maker.service';
import { MakerScheduuleService } from './maker.schedule'
@Module({
  imports: [],
  providers: [MakerService, MakerScheduuleService],
  exports: [MakerService]
})
export class MakerModule { }
