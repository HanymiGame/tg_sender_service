import Redis from 'ioredis';
import config from './config';
import logger from './logger';

if (!config.redis.password) {
    logger.warn('REDIS_PASSWORD не задан — подключение без пароля (небезопасно в продакшене!)');
}

const redis = new Redis({
    host:          config.redis.host,
    port:          config.redis.port,
    password:      config.redis.password,
    db:            config.redis.db,
    keyPrefix:     config.redis.keyPrefix,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    lazyConnect:   true,
});

redis.on('connect',      ()      => logger.info(`Redis: соединение установлено (${config.redis.host}:${config.redis.port})`));
redis.on('ready',        ()      => logger.info('Redis: готов к работе'));
redis.on('error',        (e: Error) => logger.error(`Redis: ошибка: ${e.message}`));
redis.on('close',        ()      => logger.warn('Redis: соединение закрыто'));
redis.on('reconnecting', ()      => logger.warn('Redis: переподключение...'));

export default redis;
