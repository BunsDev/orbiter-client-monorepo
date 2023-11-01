import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import ecsFormat from '@elastic/ecs-winston-format'
export type OrbiterLogger = winston.Logger;
export function loggerFormat() {
  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, stack, service }) => {
      return `${timestamp} ${service && service.name} [${level}]: ${message}\n${stack || ''}`;
    })
  );
}

export function createLoggerByName(context: string, meta: any = {}): OrbiterLogger {
  const dirName = process.env['APP_NAME'] ||  __dirname.substring(__dirname.lastIndexOf('/') + 1);
  const transports = [
    new winston.transports.Console({
      format: loggerFormat()
    }),
    new DailyRotateFile({
      filename: `logs/${context || "app"}/app-%DATE%.log`,
      datePattern: 'YYYY-MM-DD', //
      maxSize: '20m',
      format: ecsFormat({
        apmIntegration: true
      }),
      maxFiles: '7d',
    }),];

  const logger = winston.createLogger({
    level: process.env['LOG_LEVEL'] || 'debug',
    defaultMeta: {
      ...Object.assign(meta, {
        service: {
          name: dirName
        }
      }),
      context: context,
    },
    transports,
  });
  return logger;
}
