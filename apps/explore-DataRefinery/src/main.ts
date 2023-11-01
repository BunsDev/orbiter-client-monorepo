/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { NestFactory } from '@nestjs/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { AppModule } from './app/app.module';
import { WinstonModule } from 'nest-winston';
import { logger, characterPattern } from '@orbiter-finance/utils'
const sysLogger = logger.createLoggerByName('app');

async function bootstrap() {
  console.debug(characterPattern);
  await NestFactory.createApplicationContext(AppModule, {
    logger: WinstonModule.createLogger({
      instance: sysLogger
    })
  });
  sysLogger.info(`🚀 Application is running on: explore-DataRefinery`);
}
process.on('uncaughtException', (err) => {
  sysLogger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, _promise) => {
  sysLogger.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap();
