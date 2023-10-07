import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import ecsFormat from '@elastic/ecs-winston-format'
export type OrbiterLogger = winston.Logger;
export function loggerFormat() {
  // return winston.format.combine(
  //   winston.format.colorize(),
  //   winston.format.timestamp(),
  //   winston.format.json(),
  //   // winston.format.printf(({ timestamp, level, message, stack, service }) => {
  //   //   return `${timestamp} ${service || ""} [${level}]: ${message}\n${stack || ''}`;
  //   // })
  // );
  // return winston.format.combine(
  //   winston.format.timestamp(), // 
  //   winston.format.json() // 
  // )
  return ecsFormat({
    apmIntegration:true
  });
}

export function createLoggerByName(context: string, meta: any = {}):OrbiterLogger {
  const dirName = __dirname.substring(__dirname.lastIndexOf('/') + 1);
  const transports = [new winston.transports.Console(), new DailyRotateFile({
    filename: `logs/${context || "app"}/app-%DATE%.log`,
    datePattern: 'YYYY-MM-DD', //
    maxSize: '20m',
    maxFiles: '7d',
  }),];
  
  const logger = winston.createLogger({
    level: 'debug',
    format: loggerFormat(),
    defaultMeta: {
      ...Object.assign(meta, {
        service: {
          name: dirName
        }
      }),
      context:context,
    },
    transports,
  });
  return logger;
}
