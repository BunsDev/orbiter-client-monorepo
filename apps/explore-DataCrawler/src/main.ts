import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { logger,characterPattern } from '@orbiter-finance/utils'
const sysLogger = logger.createLoggerByName('app');
async function bootstrap() {
  console.debug(characterPattern);
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: sysLogger
    })
  });
  const port = process.env.PORT || 3000;
  sysLogger.info(`🚀 Application is running on: http://localhost:${port}`);
  await app.listen(port);
}
process.on('uncaughtException', (err) => {
  sysLogger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, promise) => {
  sysLogger.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap()

