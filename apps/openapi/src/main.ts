import { NestExpressApplication } from '@nestjs/platform-express';
/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/error.filter';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import {ErrorInterceptor} from './shared/interceptors/error.interceptor';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const globalPrefix = 'sdk';
  app.setGlobalPrefix(globalPrefix);
  app.enableCors();
  const port = process.env.PORT || 3000;
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new TransformInterceptor(),new ErrorInterceptor())
  app.set('trust proxy', true);
  app.use(helmet());
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error(`Unhandled Rejection at: ${reason}`)
});
bootstrap();
