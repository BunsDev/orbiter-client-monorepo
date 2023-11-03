import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArbitrationModule } from './arbitration/arbitration.module';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [
    ConfigModule.forRoot(),
    ArbitrationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
