import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export function loggerFormat () {
  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, stack,service }) => {
      return `${timestamp} ${service} [${level}]: ${message}\n${stack || ''}`;
    })
  );
}
// export function loggerFormat () {
//   return winston.format.combine(
//     winston.format.timestamp({
//       format: 'YYYY-MM-DD HH:mm:ss',
//     }),
//     winston.format.json(),
//   )
// }


export function createLoggerByName(name: string) {
  const transports = [ new winston.transports.Console(),new DailyRotateFile({
    filename: `logs/${name}/app-%DATE%.log`,
    datePattern: 'YYYY-MM-DD', //
    maxSize: '20m',
    maxFiles: '7d',
  }),];
  const logger = winston.createLogger({
    level: 'debug',
    format: loggerFormat(),
    defaultMeta: {
      service:name
    },
    transports,
  });
  return logger;
}
