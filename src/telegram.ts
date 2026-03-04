import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import config from './config';
import logger from './logger';

function sanitizeProxyUrl(url: string): string {
    return url.replace(/\/\/[^@]+@/, '//***:***@');
}

export function createTelegramClient(): Telegraf['telegram'] {
    const options: ConstructorParameters<typeof Telegraf>[1] = {
        telegram: {
            apiRoot: config.telegram.apiUrl,
        },
    };

    if (config.proxy.enabled) {
        const { user, pass, host, port } = config.proxy;
        const auth     = user && pass ? `${user}:${pass}@` : '';
        const proxyUrl = `socks5://${auth}${host}:${port}`;

        if (options.telegram) {
            (options.telegram as Record<string, unknown>)['agent'] = new SocksProxyAgent(proxyUrl);
        }

        logger.info(`Telegram: используем прокси ${sanitizeProxyUrl(proxyUrl)}`);
    }

    const bot = new Telegraf(config.telegram.botToken, options);
    return bot.telegram;
}
