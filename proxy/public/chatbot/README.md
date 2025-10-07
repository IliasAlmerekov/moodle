# AI Chatbot Integration for Moodle

## Шаг 1: Deploy файлов

После коммита и пуша, на Raspberry Pi выполни:

```bash
cd /home/admin/moodle
./deploy.sh
```

Скрипт автоматически скопирует файлы чат-бота в `/var/www/html/local/aichatbot/`

## Шаг 2: Встрой чат-бот в Moodle

### Через Additional HTML (рекомендуется):

1. Зайди в Moodle как администратор
2. Перейди: **Site administration → Appearance → Additional HTML**
3. Найди поле **"When BODY is opened"** или **"Before BODY is closed"**
4. Скопируй и вставь код из файла `moodle-embed.html`
5. Сохрани изменения

### Проверь что файлы доступны:

Открой в браузере:

- `http://192.168.178.49:8080/local/aichatbot/chatbot.css`
- `http://192.168.178.49:8080/local/aichatbot/chatbot.js`

Если видишь код - всё ОК! ✅

## Шаг 3: Проверь чат-бот

1. Обнови любую страницу Moodle
2. Должна появиться кнопка чата 💬 в правом нижнем углу
3. Кликни на кнопку - откроется окно чата
4. Напиши сообщение и проверь ответ от AI

## Troubleshooting

### Чат не появляется:

- Проверь что файлы скопированы в `/var/www/html/local/aichatbot/`
- Проверь права доступа: `ls -la /var/www/html/local/aichatbot/`
- Очисти кеш Moodle: **Site administration → Development → Purge all caches**

### Ошибка в консоли браузера:

- Открой DevTools (F12)
- Посмотри ошибки в консоли
- Проверь что API доступен: `http://192.168.178.49:3000/health`

### Не приходит ответ от AI:

- Проверь что Ollama запущен: `http://192.168.178.35:11434/api/tags`
- Проверь логи Fastify: `docker-compose logs proxy`
- Проверь CORS настройки

## Файлы

- `chatbot.js` - основная логика чата
- `chatbot.css` - стили
- `loadingMessage.js` - индикатор загрузки
- `removeMessage.js` - удаление сообщений
- `moodle-embed.html` - HTML код для встраивания в Moodle
- `index.html` - standalone версия для тестирования

## API Endpoints

- `POST /api/chat` - отправка сообщения (обычный ответ)
- `POST /api/chat-stream` - отправка сообщения (streaming ответ)
- `GET /health` - проверка здоровья сервиса
