import 'dotenv/config';
import { Server } from 'http';
import config                   from './config';
import logger                   from './logger';
import redis                    from './redis';
import { createTelegramClient } from './telegram';
import { createProcessor }      from './processor';
import { createHealthServer }   from './health';
import { QueuePayload }         from './types';

const telegram           = createTelegramClient();
const { processMessage } = createProcessor(telegram);

const activeRequests = new Set<Promise<boolean>>();
let isShuttingDown   = false;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let healthServer:    Server;

function track(promise: Promise<boolean>): Promise<boolean> {
    activeRequests.add(promise);
    return promise
        .catch((err: Error) => {
            logger.error(`Необработанная ошибка в задаче: ${err.message}`);
            return false;
        })
        .finally(() => activeRequests.delete(promise));
}

function getRetryDelay(attempt: number): number {
    const base   = config.queue.retryBaseDelay * Math.pow(2, attempt - 1);
    const jitter = base * 0.2 * (Math.random() - 0.5);
    return Math.max(1000, Math.round(base + jitter));
}

async function runQueue(): Promise<void> {
    logger.info('Подключаемся к Redis...');
    await redis.connect();
    logger.info(`Очередь запущена. Ключ: ${config.redis.queueKey}`);

    let lastMetricState = '';

    metricsInterval = setInterval(async () => {
        try {
            const qLen = await redis.llen(config.redis.queueKey);
            const dLen = await redis.llen(config.redis.deadLetterKey);
            const active = activeRequests.size;

            const currentState = `${qLen}:${dLen}:${active}`;
            const hasActivity  = qLen > 0 || dLen > 0 || active > 0;

            if (hasActivity || currentState !== lastMetricState) {
                logger.debug(`[METRIC] queue=${qLen} dlq=${dLen} active=${active}`);
            }

            lastMetricState = currentState;
        } catch {}
    }, 60000);

    while (!isShuttingDown) {
        try {
            const result = await redis.brpop(config.redis.queueKey, 2);
            if (!result) continue;

            const [, value] = result;
            let payload: QueuePayload;

            try {
                payload = JSON.parse(value) as QueuePayload;
            } catch {
                logger.error(`Невалидный JSON из Redis: ${value}`);
                continue;
            }

            logger.info(`Получено: Chat ID ${payload.data?.chat_id ?? 'unknown'}, метод: ${payload.method}`);

            const success = await track(processMessage(payload));

            if (!success) {
                payload.retries = (payload.retries ?? 0) + 1;

                if (payload.retries <= config.queue.maxRetries) {
                    const delay = getRetryDelay(payload.retries);
                    logger.info(`Retry через ${delay}ms (попытка ${payload.retries}/${config.queue.maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    await redis.rpush(config.redis.queueKey, JSON.stringify(payload));
                } else {
                    logger.warn(`Превышен maxRetries — отправляем в DLQ. Chat: ${payload.data?.chat_id ?? 'unknown'}, метод: ${payload.method}`);
                    await redis.rpush(config.redis.deadLetterKey, JSON.stringify(payload));
                }
            }
        } catch (error) {
            if (!isShuttingDown) {
                logger.error(`Ошибка в цикле очереди: ${(error as Error).message}`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    logger.info('Цикл очереди завершён.');
}

async function gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Сигнал ${signal}. Активных запросов: ${activeRequests.size}`);
    isShuttingDown = true;

    if (metricsInterval) {
        clearInterval(metricsInterval);
    }

    if (activeRequests.size > 0) {
        logger.info(`Ожидаем завершения ${activeRequests.size} запросов (до 10s)...`);
        await Promise.race([
            Promise.allSettled(Array.from(activeRequests)),
            new Promise(resolve => setTimeout(resolve, 10000)),
        ]);
    }

    healthServer.close(() => {
        logger.info('Завершение работы.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => void gracefulShutdown('SIGINT'));

healthServer = createHealthServer(() => ({
    activeRequests: activeRequests.size,
    shuttingDown:   isShuttingDown,
}));

void runQueue();
