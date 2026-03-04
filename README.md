# 📮 TG Sender Service

Микросервис-очередь для отправки сообщений в Telegram из бэкенда.  
Обрабатывает сообщения асинхронно через Redis, поддерживает файлы (base64), прокси, retry-логику и Dead Letter Queue.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker)](https://www.docker.com/)
[![Telegraf](https://img.shields.io/badge/Telegraf-4.x-purple)](https://telegraf.js.org/)

---

## 🚀 Особенности

- ✅ **Асинхронная обработка** — очередь на Redis, не блокирует основной бэкенд
- ✅ **Поддержка файлов** — base64 + gzip, автоматическая распаковка и отправка
- ✅ **Надёжность** — экспоненциальный бэк-офф, DLQ для «мёртвых» сообщений
- ✅ **Rate limiting aware** — уважает `429 Too Many Requests` от Telegram API
- ✅ **Production-ready** — graceful shutdown, health-checks, логирование с ротацией
- ✅ **Безопасность** — non-root user в Docker, sanitizing прокси-URL, no secrets in logs
- ✅ **TypeScript** — полная типизация, `strict: true`, безопасный рефакторинг
- ✅ **Модульная архитектура** — легко тестировать, расширять, мокать зависимости

---

## 🏗 Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  PHP/Etc        │     │  TG Sender      │     │  Telegram       │
│  Backend        │────▶│  Service        │────▶│  Bot API        │
│  (producer)     │     │  (consumer)     │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Redis Queue            │
                    │  • telegram_messages    │
                    │  • telegram_messages:dlq│
                    └─────────────────────────┘
```

### Компоненты

| Файл | Ответственность |
|------|----------------|
| `src/config.ts` | Валидация и типизация конфигурации |
| `src/logger.ts` | Winston-логгер с ротацией файлов |
| `src/redis.ts` | Подключение к Redis с retry-логикой |
| `src/telegram.ts` | Фабрика Telegram-клиента (Telegraf) |
| `src/processor.ts` | Обработчики методов Telegram API |
| `src/health.ts` | Express-сервер для `/health` и `/metrics` |
| `src/utils/fileDecoder.ts` | Декодер base64/gzip файлов |
| `src/types/index.ts` | Централизованные TypeScript-интерфейсы |

---

## 📋 Требования

- Node.js 20.x
- Redis 6+
- Docker & Docker Compose (опционально, но рекомендуется)
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))

---

## ⚙️ Установка и запуск

### 1. Клонирование и зависимости

```bash
git clone https://github.com/HanymiGame/tg_sender_service.git
cd tg_sender_service
npm ci
```

### 2. Переменные окружения

Скопируйте `.env.example` и заполните значения:

```bash
cp .env.example .env
```

```dotenv
# Telegram
TG_BOT_TOKEN=your_bot_token_here
TG_API_URL=https://api.telegram.org

# Redis
REDIS_HOST=host.docker.internal
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=2
REDIS_KEY_PREFIX=user:
REDIS_QUEUE_KEY=telegram_messages
REDIS_DLQ_KEY=telegram_messages:dlq

# Proxy (SOCKS5, опционально)
USE_PROXY=false
PROXY_HOST=
PROXY_PORT=
PROXY_USER=
PROXY_PASS=

# Health server
HEALTH_PORT=3009
HEALTH_HOST=0.0.0.0

# Queue settings
MAX_RETRIES=3
RETRY_BASE_DELAY_MS=5000

# Logging
LOG_LEVEL=info
LOG_DIR=logs
SERVICE_NAME=tg-sender
```

> ⚠️ **Важно**: `TG_BOT_TOKEN` — обязательная переменная. Сервис не запустится без неё.

### 3. Запуск

#### 🔹 Локально (dev-режим)

```bash
npm run dev
```

> ℹ️ `npm run dev` запускает `ts-node` без авто-перезагрузки. Для watch-режима установите `nodemon`:
> ```bash
> npm install -D nodemon
> npx nodemon --exec ts-node src/index.ts
> ```

#### 🔹 Сборка и запуск в продакшене

```bash
npm run build
npm start
```

#### 🔹 Docker Compose (рекомендуется)

```bash
docker compose up --build -d
```

Проверка статуса:
```bash
docker compose logs -f tg_sender
curl http://127.0.0.1:3009/health
```

---

## 📦 Формат сообщения в очереди

Сервис ожидает JSON-сообщения в Redis-списке (`REDIS_QUEUE_KEY`).

### Базовая структура

```json
{
  "method": "/sendMessage",
  "data": {
    "chat_id": 123456789,
    "text": "Привет, мир!",
    "parse_mode": "HTML"
  },
  "ts": 1709567890123
}
```

### Поддерживаемые методы

| Метод | Обязательные поля в `data` | Описание |
|-------|---------------------------|----------|
| `/sendMessage` | `chat_id`, `text` | Отправка текста |
| `/editMessageText` | `chat_id`, `message_id`, `text` | Редактирование сообщения |
| `/deleteMessage` | `chat_id`, `message_id` | Удаление сообщения |
| `/sendPhoto` | `chat_id`, `photo` | Отправка фото |
| `/sendDocument` | `chat_id`, `document` | Отправка документа |
| `/sendAudio` | `chat_id`, `audio` | Отправка аудио |
| `/sendVoice` | `chat_id`, `voice` | Отправка голосового |
| `/sendVideo` | `chat_id`, `video` | Отправка видео |
| `/sendMediaGroup` | `chat_id`, `media` | Отправка альбома (2-10 медиа) |

### Отправка файлов (base64)

Для отправки файлов из PHP используйте формат `TelegramFilePayload`.  
Все четыре поля обязательны:

| Поле | Тип | Описание |
|------|-----|----------|
| `_type` | `"base64_file"` | Маркер типа, всегда `"base64_file"` |
| `_compressed` | `boolean` | `true` если данные сжаты gzip, иначе `false` |
| `data` | `string` | Base64-encoded содержимое файла (после gzip если `_compressed: true`) |
| `filename` | `string` | Имя файла для Telegram |
| `mime` | `string` | MIME-тип файла |

**Пример — файл без сжатия (`_compressed: false`):**

```json
{
  "method": "/sendDocument",
  "data": {
    "chat_id": 123456789,
    "document": {
      "_type": "base64_file",
      "_compressed": false,
      "data": "SGVsbG8gV29ybGQh...",
      "filename": "report.pdf",
      "mime": "application/pdf"
    },
    "caption": "Ежемесячный отчёт"
  },
  "ts": 1709567890123
}
```

**Пример — файл со сжатием (`_compressed: true`, рекомендуется для файлов >10MB):**

```json
{
  "method": "/sendDocument",
  "data": {
    "chat_id": 123456789,
    "document": {
      "_type": "base64_file",
      "_compressed": true,
      "data": "H4sIAAAAAAAAA...",
      "filename": "archive.zip",
      "mime": "application/zip"
    }
  },
  "ts": 1709567890123
}
```

> ⚠️ Поле `_compressed` всегда обязательно. При `true` сервис вызовет `gunzip` перед отправкой.  
> При `false` данные передаются напрямую в Telegram API.

### Пример на PHP

```php
// Без сжатия (файл < 10MB)
$encoded = base64_encode(file_get_contents($filePath));

// Со сжатием (файл > 10MB)
$encoded = base64_encode(gzencode(file_get_contents($filePath), 6));
$compressed = true;

$payload = [
    '_type'       => 'base64_file',
    '_compressed' => $compressed ?? false,
    'data'        => $encoded,
    'filename'    => basename($filePath),
    'mime'        => mime_content_type($filePath) ?: 'application/octet-stream',
];
```

### Альбом медиа (`/sendMediaGroup`)

```json
{
  "method": "/sendMediaGroup",
  "data": {
    "chat_id": 123456789,
    "media": "[{\"type\":\"photo\",\"media\":\"attach://photo1.jpg\",\"caption\":\"Фото 1\"},{\"type\":\"photo\",\"media\":\"attach://photo2.jpg\"}]",
    "photo1.jpg": {
      "_type": "base64_file",
      "_compressed": false,
      "data": "...",
      "filename": "photo1.jpg",
      "mime": "image/jpeg"
    },
    "photo2.jpg": {
      "_type": "base64_file",
      "_compressed": false,
      "data": "...",
      "filename": "photo2.jpg",
      "mime": "image/jpeg"
    }
  },
  "ts": 1709567890123
}
```

> 💡 Ключи файлов в `data` должны совпадать с именами после `attach://` в поле `media`.  
> Поле `media` может быть строкой JSON или массивом объектов.

---

## 🩺 Health & Metrics

### Эндпоинты

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | Статус сервиса и Redis |
| `/metrics` | GET | Размеры очередей и активные запросы |

### Пример ответа `/health`

```json
{
  "status": "ok",
  "active_requests": 3,
  "shutting_down": false
}
```

### Пример ответа `/metrics`

```json
{
  "queue_size": 42,
  "dlq_size": 1,
  "active_requests": 3,
  "shutting_down": false
}
```

### Docker Healthcheck

Образ включает встроенный healthcheck, использующий `/health` эндпоинт:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3009/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
```

---

## 🔄 Retry-логика и DLQ

### Повторные попытки

- **Экспоненциальный бэк-офф**: `delay = base * 2^(attempt-1) + jitter`
- **Jitter**: ±10% от текущей задержки для предотвращения thundering herd
- **Максимум попыток**: настраивается через `MAX_RETRIES` (по умолчанию 3)
- **Ретраи идут в хвост очереди** (`RPUSH`) — не блокируют новые сообщения (FIFO)

### Пример задержек при `RETRY_BASE_DELAY_MS=5000`

| Попытка | Базовая задержка | С jitter (примерно) |
|---------|-----------------|---------------------|
| 1 | 5s | 4.5s – 5.5s |
| 2 | 10s | 9s – 11s |
| 3 | 20s | 18s – 22s |

### Dead Letter Queue (DLQ)

Сообщения попадают в DLQ (`REDIS_DLQ_KEY`), если:

1. Метод неизвестен (`handler not found`)
2. Ошибка Telegram API с кодом `400` или `403` (неисправимая)
3. Превышено `maxRetries`

```bash
# Просмотр «мёртвых» сообщений
redis-cli LLEN telegram_messages:dlq
redis-cli LRANGE telegram_messages:dlq 0 -1

# Переотправить первое сообщение из DLQ обратно в очередь
redis-cli RPOPLPUSH telegram_messages:dlq telegram_messages
```

> 💡 DLQ — инструмент для отладки. Настройте алерт на рост `dlq_size` через `/metrics`.

---

## 🗂 Структура проекта

```
tg_sender_service/
├── src/
│   ├── config.ts                 # Конфигурация + валидация
│   ├── logger.ts                 # Winston-логгер
│   ├── redis.ts                  # Redis-клиент (ioredis)
│   ├── telegram.ts               # Telegraf-клиент фабрика
│   ├── processor.ts              # Обработчики Telegram-методов
│   ├── health.ts                 # Express health-server
│   ├── index.ts                  # Точка входа
│   ├── types/
│   │   └── index.ts              # TypeScript-интерфейсы
│   └── utils/
│       └── fileDecoder.ts        # Base64/gzip декодер
├── dist/                         # Скомпилированный JS (gitignore)
├── logs/                         # Логи с ротацией (gitignore)
├── package.json
├── tsconfig.json
├── Dockerfile                    # Multi-stage build
├── docker-compose.yml
├── .env.example                  # Шаблон переменных окружения
├── .dockerignore
└── README.md
```

---

## 🛠 Разработка

### Команды npm

```bash
npm run dev          # Запуск через ts-node (без авто-перезагрузки)
npm run build        # Компиляция TypeScript → dist/
npm run start        # Запуск скомпилированной версии из dist/
npm run typecheck    # Проверка типов без компиляции
```

### Линтинг и форматирование (рекомендуется добавить)

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

Добавить в `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

---

## 📊 Мониторинг и логи

### Формат логов

```
YYYY-MM-DD HH:mm:ss [LEVEL] [service@version]: message
```

- Вывод в консоль + файлы: `logs/tg-sender-YYYY-MM-DD.log`
- Хранение: 30 дней (`maxFiles: '30d'`)
- Уровень настраивается через `LOG_LEVEL` (по умолчанию `info`)

### Примеры записей

```
2024-03-04 12:34:56 [INFO]  [tg-sender@1.0.0]: Redis: готов к работе
2024-03-04 12:35:01 [INFO]  [tg-sender@1.0.0]: OK [/sendMessage] Chat ID: 123456789
2024-03-04 12:35:02 [WARN]  [tg-sender@1.0.0]: [/sendPhoto] Rate limit (429), ждём 3s
2024-03-04 12:35:10 [WARN]  [tg-sender@1.0.0]: [METRIC] queue=5 dlq=0 active=2
2024-03-04 12:35:15 [ERROR] [tg-sender@1.0.0]: [/sendDocument] Финальная ошибка API 403 — отправляем в DLQ
```

### Интеграция с Prometheus (опционально)

```bash
npm install prom-client
```

Расширьте `/metrics` в `src/health.ts` для экспорта метрик в формате Prometheus/Grafana.

---

## 🐛 Troubleshooting

| Проблема | Возможная причина | Решение |
|----------|------------------|---------|
| Сервис не подключается к Redis | Неверный `REDIS_HOST` | На Linux добавьте в `docker-compose.yml`: `extra_hosts: - "host.docker.internal:host-gateway"` |
| Сообщения не отправляются | Неверный `TG_BOT_TOKEN` | Проверьте токен через `https://api.telegram.org/bot<TOKEN>/getMe` |
| Ошибка `Base64 roundtrip validation failed` | Повреждённые данные в `data` | Проверьте encoding на стороне PHP, поле `_compressed` должно точно соответствовать типу сжатия |
| Поле `_compressed` не задано | Ошибка формирования payload на PHP | Поле обязательно: передавайте `false` для несжатых файлов, `true` после `gzencode()` |
| Рост `dlq_size` | Частые 400/403 ошибки | Проверьте `chat_id`, права бота, формат сообщений |
| Высокая задержка | Большая очередь | Проверьте `/metrics`, при необходимости увеличьте `MAX_RETRIES` или оптимизируйте Redis |

### Включение отладочных логов

```dotenv
LOG_LEVEL=debug
```

---

## 🔐 Безопасность

- ✅ Сервис запускается от non-root user (`nodejs:nodejs`)
- ✅ Прокси-пароли не попадают в логи (`sanitizeProxyUrl`)
- ✅ Health-эндпоинты слушают `127.0.0.1` на хосте (проброс порта только на localhost)
- ✅ `.env` и секреты исключены из образа через `.dockerignore`

> ⚠️ **Не запускайте без `REDIS_PASSWORD` в продакшене!** Сервис предупреждает об этом в логах при старте.

---

## 📄 Лицензия

ISC © 2026

---

> 💡 **Совет**: Добавьте этот сервис в ваш `docker-compose.yml` основного проекта — и PHP-бэкенд сможет отправлять сообщения в Telegram просто делая `RPUSH` в Redis. Быстро, надёжно, без блокировок. 🚀
