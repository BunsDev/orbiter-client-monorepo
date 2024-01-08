import winston from 'winston';
import 'winston-daily-rotate-file';

const { transports, format } = winston;
const { label } = format;
const logLevels: any = {
    levels: {
        emerg: 0,
        alert: 1,
        crit: 2,
        error: 3,
        warning: 4,
        notice: 5,
        info: 6,
        debug: 7,
    },
    colors: {
        emerg: 'red',
        alert: 'red',
        crit: 'red',
        error: 'red',
        warning: 'yellow',
        notice: 'blue',
        info: 'green',
        debug: 'green',
    },
};

import 'winston-daily-rotate-file';
import * as path from 'path';
import { getFormatDate } from "./util";
export interface LoggerOptions {
    key?: string;
    dir?: string;
    label?: string;
}

export class LoggerService {
    static services: { [key: string]: winston.Logger } = {};

    static createLogger(options: LoggerOptions = {}) {
        const config = Object.assign(
            {
                key: '',
                dir: `runtime/logs`,
                label: '',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '10d',
            },
            options,
        );
        const customFormat = format.printf(options => {
            const { level, label, timestamp, message, ...meta } = options;
            const metaStr = meta && Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${getFormatDate(
                new Date(timestamp).valueOf(),
            )} [${level.toUpperCase()}] ${label} ${message} ${metaStr}`;
        });
        // const consoleTransport = new transports.Console({
        //     format: format.combine(
        //         format.timestamp({ format: "YYYY/MM/DD HH:mm:ss" }),
        //         label({ label: config.label }),
        //         // format.prettyPrint(),
        //         customFormat,
        //     )
        // });
        const errorFileTransport = new transports.DailyRotateFile({
            filename: `${config.dir}/${!config.key ? '' : config.key + '-'}error-%DATE%.log`,
            datePattern: config.datePattern,
            zippedArchive: config.zippedArchive,
            maxSize: config.maxSize,
            maxFiles: config.maxFiles,
            level: 'error',

            format: format.combine(
                format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
                format.splat(),
                label({ label: config.label }),
                customFormat,
                // format.json(),
            ),
        });

        const infoFileTransport = new transports.DailyRotateFile({
            filename: `${config.dir}/${!config.key ? '' : config.key + '-'}info-%DATE%.log`,
            datePattern: config.datePattern,
            zippedArchive: config.zippedArchive,
            maxSize: config.maxSize,
            maxFiles: config.maxFiles,
            level: 'info',
            format: format.combine(
                format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
                format.splat(),
                label({ label: config.label }),
                customFormat,
                // format.json(),
                // format.prettyPrint(),
            ),
        });
        const loggerService = winston.createLogger({
            exitOnError: false,
            levels: logLevels.levels,
            format: format.simple(),
            transports: [errorFileTransport, infoFileTransport],
        });
        LoggerService.services[config.key] = loggerService;
        return loggerService;
    }

    static getLogger(key: string, options: LoggerOptions = {}) {
        return LoggerService.services[key] || LoggerService.createLogger(Object.assign(options, { key }));
    }
}

export class Logger {
    public logger;
    public name;

    constructor(name) {
        this.name = name;
        this.logger = LoggerService.getLogger(`${name}`, {
            dir: path.join(__dirname, `logs/${name}`),
        });
    }

    info(...msg) {
        const message = msg.join(' ');
        console.log(`${getFormatDate()} [INFO] ${this.name ? ` ${this.name}` : ''} \x1B[32m%s\x1b[39m`, message);
        this.logger.info(message);
    }

    error(...msg) {
        const message = msg.join(' ');
        console.log(`${getFormatDate()} [ERROR] ${this.name ? ` ${this.name}` : ''} \x1B[31m%s\x1b[39m`, message);
        this.logger.error(message);
    }
}

export const routerLogger = new Logger('router');
