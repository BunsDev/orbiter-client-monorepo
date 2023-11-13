/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { logger } from '@orbiter-finance/utils'
const sysLogger = logger.createLoggerByName('app');
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3007;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
process.on('uncaughtException', (err) => {
  sysLogger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, _promise) => {
  sysLogger.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap();
