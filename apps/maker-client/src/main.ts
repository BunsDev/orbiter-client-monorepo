/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { NestFactory } from '@nestjs/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { logger, characterPattern } from '@orbiter-finance/utils'
const sysLogger = logger.createLoggerByName('app', { service: { name: "maker-client" } });

async function bootstrap() {
    console.debug(characterPattern);
    await NestFactory.createApplicationContext(AppModule, {
    logger: WinstonModule.createLogger({
      instance: sysLogger
    })
  });
  sysLogger.info(`🚀 Application is running on: maker-client`);
}
process.on('uncaughtException', (err) => {
  sysLogger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, promise) => {
  sysLogger.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap();
