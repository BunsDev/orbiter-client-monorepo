import { characterPattern } from '@orbiter-finance/utils';
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  Logger.log(characterPattern);
  Logger.log(`🚀 Application is running on: Maker Client`);
}
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

bootstrap();