import { Module } from '@nestjs/common';
import { RpcCheckService } from './rpc-check.service';

@Module({
  providers: [RpcCheckService]
})
export class RpcCheckModule {}
