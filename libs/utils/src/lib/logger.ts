import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export function loggerFormat() {
  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, stack, service }) => {
      return `${timestamp} ${service || ""} [${level}]: ${message}\n${stack || ''}`;
    })
  );
}

export function createLoggerByName(name: string, opts: any = {}) {
  const transports = [new winston.transports.Console(), new DailyRotateFile({
    filename: `logs/${name}/app-%DATE%.log`,
    datePattern: 'YYYY-MM-DD', //
    maxSize: '20m',
    maxFiles: '7d',
  }),];
  const logger = winston.createLogger({
    level: 'debug',
    format: loggerFormat(),
    defaultMeta: {
      service: opts.label
    },
    transports,
  });
  return logger;
}
