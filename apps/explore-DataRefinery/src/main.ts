/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { characterPattern } from '@orbiter-finance/utils';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { AppModule } from './app/app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  Logger.log(characterPattern);
  Logger.log(`🚀 Application is running on: explore-DataRefinery`);
}

bootstrap();
