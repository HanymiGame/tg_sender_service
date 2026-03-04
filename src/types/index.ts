
export interface TelegramFilePayload {
    _type:        'base64_file';
    _compressed:  boolean;
    data:         string;
    filename:     string;
    mime:         string;
}

export interface TelegramMessageData {
    chat_id?:             number | string;
    message_id?:          number;
    text?:                string;
    media?:               string | TelegramMediaItem[];
    photo?:               TelegramFilePayload | string;
    audio?:               TelegramFilePayload | string;
    document?:            TelegramFilePayload | string;
    video?:               TelegramFilePayload | string;
    voice?:               TelegramFilePayload | string;
    parse_mode?:          string;
    reply_markup?:        string;
    caption?:             string;
    reply_to_message_id?: number;
    title?:               string;
    [key: string]:        unknown;
}

export interface TelegramMediaItem {
    type:        string;
    media:       string;
    caption?:    string;
    parse_mode?: string;
}

export interface QueuePayload {
    method:   string;
    data:     TelegramMessageData;
    ts:       number;
    retries?: number;
}

export interface DecodedFile {
    source:   Buffer;
    filename: string;
    mime:     string;
}

export interface ServiceStats {
    activeRequests: number;
    shuttingDown:   boolean;
}

export interface AppConfig {
    telegram: {
        apiUrl:   string;
        botToken: string;
    };
    redis: {
        host:          string;
        port:          number;
        password:      string | undefined;
        db:            number;
        keyPrefix:     string;
        queueKey:      string;
        deadLetterKey: string;
    };
    proxy: {
        enabled: boolean;
        host:    string | undefined;
        port:    string | undefined;
        user:    string | undefined;
        pass:    string | undefined;
    };
    queue: {
        maxRetries:     number;
        retryBaseDelay: number;
    };
    health: {
        port: number;
        host: string;
    };
    log: {
        level:   string;
        dir:     string;
        service: string;
        version: string;
    };
}
