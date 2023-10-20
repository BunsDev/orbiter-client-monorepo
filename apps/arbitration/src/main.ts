import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
process.env['APP_NAME'] = 'arbitration-api';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
