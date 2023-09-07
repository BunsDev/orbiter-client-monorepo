import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';


export function createLoggerByName(name: string) {
  const transports = [ new winston.transports.Console(),new DailyRotateFile({
    filename: `logs/${name}/app-%DATE%.log`,
    datePattern: 'YYYY-MM-DD', //
    maxSize: '20m',
    maxFiles: '7d',
  }),];
  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.label({ label: name }),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, label }) => {
        return `${timestamp} ${label} [${level.toUpperCase()}]: ${message}`;
      }),
    ),
    transports,
  });
  return logger;
}
