import { Telegraf } from 'telegraf';
import { InputMediaPhoto } from 'telegraf/types';
import { isBase64File, decodeFile } from './utils/fileDecoder';
import logger from './logger';
import config from './config';
import redis from './redis';
import {
    QueuePayload,
    TelegramMessageData,
    TelegramMediaItem,
    TelegramFilePayload,
} from './types';

type TelegramClient = Telegraf['telegram'];
type InputFile      = { source: Buffer; filename: string } | string;
type ExtraRecord    = Record<string, unknown>;

export function createProcessor(telegram: TelegramClient) {

    async function resolveInputFile(
        field: TelegramFilePayload | string | unknown
    ): Promise<InputFile | null> {
        if (isBase64File(field)) {
            const decoded = await decodeFile(field);
            if (!decoded) return null;
            return { source: decoded.source, filename: decoded.filename };
        }
        return typeof field === 'string' ? field : null;
    }

    function buildExtra(data: TelegramMessageData, excludeFileKeys: string[] = []): ExtraRecord {
        const systemKeys = new Set(['chat_id', 'message_id', 'text', 'media', ...excludeFileKeys]);
        const extra: ExtraRecord = { parse_mode: 'HTML' };

        for (const key in data) {
            if (systemKeys.has(key)) continue;
            if (isBase64File(data[key])) continue;
            extra[key] = data[key];
        }

        return extra;
    }

    function requireField(data: TelegramMessageData, field: keyof TelegramMessageData, method: string): void {
        if (!data[field]) {
            throw new Error(`${method}: отсутствует обязательное поле "${field}"`);
        }
    }

    type Handler = (data: TelegramMessageData) => Promise<unknown>;

    const handlers: Record<string, Handler> = {

        async '/sendMessage'(data) {
            requireField(data, 'chat_id', '/sendMessage');
            requireField(data, 'text',    '/sendMessage');
            return telegram.sendMessage(data.chat_id!, data.text!, buildExtra(data));
        },

        async '/editMessageText'(data) {
            requireField(data, 'chat_id',    '/editMessageText');
            requireField(data, 'message_id', '/editMessageText');
            requireField(data, 'text',       '/editMessageText');
            return telegram.editMessageText(
                data.chat_id!,
                data.message_id!,
                undefined,
                data.text!,
                buildExtra(data)
            );
        },

        async '/deleteMessage'(data) {
            requireField(data, 'chat_id',    '/deleteMessage');
            requireField(data, 'message_id', '/deleteMessage');
            return telegram.deleteMessage(data.chat_id!, data.message_id!);
        },

        async '/sendPhoto'(data) {
            requireField(data, 'chat_id', '/sendPhoto');
            requireField(data, 'photo',   '/sendPhoto');
            const file = await resolveInputFile(data.photo);
            if (!file) throw new Error('/sendPhoto: не удалось декодировать файл');
            return telegram.sendPhoto(data.chat_id!, file, buildExtra(data, ['photo']));
        },

        async '/sendDocument'(data) {
            requireField(data, 'chat_id',  '/sendDocument');
            requireField(data, 'document', '/sendDocument');
            const file = await resolveInputFile(data.document);
            if (!file) throw new Error('/sendDocument: не удалось декодировать файл');
            return telegram.sendDocument(data.chat_id!, file, buildExtra(data, ['document']));
        },

        async '/sendAudio'(data) {
            requireField(data, 'chat_id', '/sendAudio');
            requireField(data, 'audio',   '/sendAudio');
            const file = await resolveInputFile(data.audio);
            if (!file) throw new Error('/sendAudio: не удалось декодировать файл');
            return telegram.sendAudio(data.chat_id!, file, buildExtra(data, ['audio']));
        },

        async '/sendVoice'(data) {
            requireField(data, 'chat_id', '/sendVoice');
            requireField(data, 'voice',   '/sendVoice');
            const file = await resolveInputFile(data.voice);
            if (!file) throw new Error('/sendVoice: не удалось декодировать файл');
            return telegram.sendVoice(data.chat_id!, file, buildExtra(data, ['voice']));
        },

        async '/sendVideo'(data) {
            requireField(data, 'chat_id', '/sendVideo');
            requireField(data, 'video',   '/sendVideo');
            const file = await resolveInputFile(data.video);
            if (!file) throw new Error('/sendVideo: не удалось декодировать файл');
            return telegram.sendVideo(data.chat_id!, file, buildExtra(data, ['video']));
        },

        async '/sendMediaGroup'(data) {
            requireField(data, 'chat_id', '/sendMediaGroup');
            requireField(data, 'media',   '/sendMediaGroup');

            let mediaItems: TelegramMediaItem[];
            try {
                mediaItems = typeof data.media === 'string'
                    ? JSON.parse(data.media) as TelegramMediaItem[]
                    : data.media as TelegramMediaItem[];
            } catch (e) {
                throw new Error(`/sendMediaGroup: невалидный JSON в поле media: ${(e as Error).message}`);
            }

            const resolvedMedia = (
                await Promise.all(
                    mediaItems.map(async (item): Promise<InputMediaPhoto | null> => {
                        const attachName = item.media?.replace('attach://', '');
                        const fileData   = attachName ? data[attachName] : null;
                        const file       = await resolveInputFile(fileData);

                        if (!file) {
                            logger.error(`/sendMediaGroup: не удалось получить файл для ${attachName}`);
                            return null;
                        }

                        const resolved: InputMediaPhoto = { type: 'photo', media: file as string };
                        if (item.caption)    resolved.caption    = item.caption;
                        if (item.parse_mode) resolved.parse_mode = item.parse_mode as 'HTML' | 'Markdown' | 'MarkdownV2';
                        return resolved;
                    })
                )
            ).filter((item): item is InputMediaPhoto => item !== null);

            if (!resolvedMedia.length) {
                throw new Error('/sendMediaGroup: нет валидных медиафайлов');
            }

            return telegram.sendMediaGroup(data.chat_id!, resolvedMedia);
        },
    };

    async function processMessage(payload: QueuePayload): Promise<boolean> {
        const { method, data } = payload;

        const handler = handlers[method];

        if (!handler) {
            logger.error(`Неизвестный метод Telegram: "${method}" — отправляем в DLQ`);
            await redis.rpush(config.redis.deadLetterKey, JSON.stringify(payload));
            return true;
        }

        try {
            await handler(data);
            const preview = data.text ? ` | "${data.text.slice(0, 100)}${data.text.length > 150 ? '...' : ''}"` : '';
            logger.info(`OK [${method}] Chat ID: ${data.chat_id ?? 'unknown'}${preview}`);
            return true;
        } catch (error) {
            const tgError = error as { response?: { error_code?: number; description?: string; parameters?: { retry_after?: number } } } & Error;
            const code    = tgError?.response?.error_code;

            if (code === 429) {
                const retryAfter = tgError?.response?.parameters?.retry_after ?? 5;
                logger.warn(`[${method}] Rate limit (429), ждём ${retryAfter}s`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return false;
            }

            if (code === 400 || code === 403) {
                logger.error(`[${method}] Финальная ошибка API ${code}: ${tgError?.response?.description ?? tgError.message} — отправляем в DLQ`);
                await redis.rpush(config.redis.deadLetterKey, JSON.stringify(payload));
                return true;
            }

            logger.error(`[${method}] Ошибка: ${tgError.message}`);
            return false;
        }
    }

    return { processMessage };
}
