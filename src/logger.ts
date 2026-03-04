import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import config from './config';

const logger = winston.createLogger({
    level: config.log.level,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) =>
            `${timestamp} [${String(level).toUpperCase()}] [${config.log.service}@${config.log.version}]: ${String(message)}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
            filename:    path.join(config.log.dir, 'tg-sender-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles:    '30d',
        }),
    ],
});

export default logger;
