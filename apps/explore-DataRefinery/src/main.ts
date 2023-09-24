/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { characterPattern } from '@orbiter-finance/utils';
console.log(characterPattern);
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { AppModule } from './app/app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
  Logger.log(`🚀 Application is running on: explore-DataRefinery`);
}

bootstrap();
