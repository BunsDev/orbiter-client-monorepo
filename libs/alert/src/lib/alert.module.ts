import { Module,Global } from '@nestjs/common';
import {AlertService} from './alert.service';
import {ConfigModule} from 'libs/config/src'
@Global()
@Module({
  imports:[ConfigModule],
  controllers: [],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
