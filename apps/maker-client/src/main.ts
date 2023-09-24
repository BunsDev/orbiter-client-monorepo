import { characterPattern } from '@orbiter-finance/utils';
console.log(characterPattern);
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from '@nestjs/common';
async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
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