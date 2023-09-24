import { characterPattern } from '@orbiter-finance/utils';
console.log(characterPattern);
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  const globalPrefix = "";
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}
process.on('uncaughtException', (err) => {
  Logger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // process.exit(1);
});
bootstrap()

