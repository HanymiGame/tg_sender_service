import 'dotenv/config';
import { AppConfig } from './types';

if (!process.env['TG_BOT_TOKEN']) {
    throw new Error('TG_BOT_TOKEN is required');
}

const config: AppConfig = {
    telegram: {
        apiUrl:   (process.env['TG_API_URL'] || 'https://api.telegram.org').trim(),
        botToken: process.env['TG_BOT_TOKEN'].trim(),
    },
    redis: {
        host:          process.env['REDIS_HOST']        || 'host.docker.internal',
        port:          parseInt(process.env['REDIS_PORT']  || '6379'),
        password:      process.env['REDIS_PASSWORD']    || undefined,
        db:            parseInt(process.env['REDIS_DB']    || '2'),
        keyPrefix:     process.env['REDIS_KEY_PREFIX']  || '',
        queueKey:      process.env['REDIS_QUEUE_KEY']   || 'telegram_messages',
        deadLetterKey: process.env['REDIS_DLQ_KEY']     || 'telegram_messages:dlq',
    },
    proxy: {
        enabled: process.env['USE_PROXY'] === 'true',
        host:    process.env['PROXY_HOST'],
        port:    process.env['PROXY_PORT'],
        user:    process.env['PROXY_USER'],
        pass:    process.env['PROXY_PASS'],
    },
    queue: {
        maxRetries:     parseInt(process.env['MAX_RETRIES']          || '3'),
        retryBaseDelay: parseInt(process.env['RETRY_BASE_DELAY_MS']  || '5000'),
    },
    health: {
        port: parseInt(process.env['HEALTH_PORT'] || '3009'),
        host: process.env['HEALTH_HOST'] || '127.0.0.1',
    },
    log: {
        level:   process.env['LOG_LEVEL']    || 'info',
        dir:     process.env['LOG_DIR']      || 'logs',
        service: process.env['SERVICE_NAME'] || 'tg-sender',
        version: process.env['npm_package_version'] || '1.0.0',
    },
};

export default config;
