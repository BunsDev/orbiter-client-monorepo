import { Module, Global } from '@nestjs/common';
import { TcpService } from './tcp.service';
@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TcpService],
  exports: [TcpService],
})
export class TcpModule { }
