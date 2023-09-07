import { Module, Global } from '@nestjs/common';
import { AlertService } from './alert.service';
@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule { }
