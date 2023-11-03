import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArbitrationModule } from './arbitration/arbitration.module';
import { ConfigModule } from '@nestjs/config';
import {AppInitializer} from './providers/init-config/init-config'
@Module({
  imports: [
    ConfigModule.forRoot(),
    ArbitrationModule,
  ],
  controllers: [AppController],
  providers: [AppInitializer,AppService],
})
export class AppModule {}
