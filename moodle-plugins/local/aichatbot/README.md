# local_aichatbot

Small Moodle local plugin that injects the AI chatbot widget for authenticated users.

## Setup

1. Open Moodle as admin.
2. Run the Moodle plugin upgrade when prompted, or visit:
   `/admin/index.php`
3. Open:
   `Site administration -> Plugins -> Local plugins -> AI chatbot`
4. Enable the chatbot.
5. Set `Authentication secret` to the same value as the proxy `CHATBOT_AUTH_SECRET`.
6. For local testing set:
   `Proxy API URL = http://127.0.0.1:3000`
   `Asset base URL = http://127.0.0.1:3000`

In production, leave the URL fields empty when `/chatbot` assets and `/api` routes
are served from the same origin as Moodle.

## How it works

For every logged-in non-guest user the plugin signs:

```text
userId.ts
```

with `hash_hmac('sha256', ..., authsecret)` and outputs:

```js
window.CHATBOT_CONFIG = { userId, ts, sig, apiUrl };
```

before loading `/chatbot/chatbot.js`. The shared secret is never sent to the
browser.
