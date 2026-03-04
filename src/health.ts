import express, { Request, Response } from 'express';
import { Server } from 'http';
import redis from './redis';
import logger from './logger';
import config from './config';
import { ServiceStats } from './types';

export function createHealthServer(getStats: () => ServiceStats): Server {
    const app = express();

    app.get('/health', async (_req: Request, res: Response) => {
        try {
            await redis.ping();
            res.json({
                status:          'ok',
                active_requests: getStats().activeRequests,
                shutting_down:   getStats().shuttingDown,
            });
        } catch (e) {
            res.status(503).json({ status: 'error', reason: (e as Error).message });
        }
    });

    app.get('/metrics', async (_req: Request, res: Response) => {
        try {
            const queueSize = await redis.llen(config.redis.queueKey);
            const dlqSize   = await redis.llen(config.redis.deadLetterKey);
            res.json({
                queue_size:      queueSize,
                dlq_size:        dlqSize,
                active_requests: getStats().activeRequests,
                shutting_down:   getStats().shuttingDown,
            });
        } catch (e) {
            res.status(503).json({ status: 'error', reason: (e as Error).message });
        }
    });

    const server = app.listen(config.health.port, config.health.host, () => {
        logger.info(`Health server: http://${config.health.host}:${config.health.port}`);
    });

    return server;
}
