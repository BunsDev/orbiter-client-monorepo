import { Logger } from 'winston';
import { createLoggerByName } from './logger';
export type OrbiterLogger = Logger;
function getLoggerForClass(context: string | undefined, target: any, opts?:any): Logger {
  const className = target.constructor.name;
  return createLoggerByName(context || className, opts);
}

export function LoggerDecorator(context?: string, opts?: any) {
  return function (target: any, key: string) {
    let logger: Logger;
    const getter = function () {
      if (!logger) {
        logger = getLoggerForClass(context, target, opts);
      }
      return logger;
    };

    Object.defineProperty(target, key, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  };
}