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
const sysLogger = logger.createLoggerByName('app');

async function bootstrap() {
  console.debug(characterPattern);
  const app = await NestFactory.create(AppModule, {

  });
  const port = process.env.PORT || 3000;
  sysLogger.info(`🚀 Application is running on: maker-client http://localhost:${port}`);
  await app.listen(port);
}
process.on('uncaughtException', (err) => {
  sysLogger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, promise) => {
  sysLogger.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap();
