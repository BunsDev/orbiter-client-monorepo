import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArbitrationModule } from './arbitration/arbitration.module';

@Module({
  imports: [
    ArbitrationModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
