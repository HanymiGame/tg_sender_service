import zlib from 'zlib';
import { promisify } from 'util';
import logger from '../logger';
import { TelegramFilePayload, DecodedFile } from '../types';

const gunzip = promisify(zlib.gunzip);

export function isBase64File(value: unknown): value is TelegramFilePayload {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as TelegramFilePayload)._type === 'base64_file' &&
        typeof (value as TelegramFilePayload).data === 'string'
    );
}

export async function decodeFile(value: TelegramFilePayload): Promise<DecodedFile | null> {
    try {
        const decoded = Buffer.from(value.data, 'base64');

        if (decoded.toString('base64') !== value.data.replace(/\s/g, '')) {
            throw new Error('Base64 roundtrip validation failed');
        }

        const source = value._compressed
            ? await gunzip(decoded)
            : decoded;

        return {
            source:   source as Buffer,
            filename: value.filename || 'file',
            mime:     value.mime     || 'application/octet-stream',
        };
    } catch (e) {
        logger.error(`Ошибка декодирования base64-файла "${value.filename}": ${(e as Error).message}`);
        return null;
    }
}
