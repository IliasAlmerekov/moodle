# Raspi Proxy

Dieses Repository buendelt Hilfsdienste fuer einen Raspberry-Pi-gestuetzten KI-Assistenten. Der Kern ist ein Fastify-Proxy (`proxy/`), der Anfragen zwischen einer lokalen Moodle-Installation und einer Ollama-Instanz vermittelt.

## Schnellstart
- Voraussetzungen: Node.js 20+, npm.
- Abhaengigkeiten installieren: `cd proxy && npm install`.
- Server starten: `npm start` im Ordner `proxy`.

## Konfiguration
Der Proxy liest seine Einstellungen aus Umgebungsvariablen (siehe `.env` als Vorlage):
- `MOODLE_URL` - Basis-URL der Moodle-Instanz.
- `MOODLE_TOKEN` - Webservice-Token fuer Moodle.
- `OLLAMA_URL` - Endpoint des Ollama-Servers.
- `OLLAMA_MODEL` - Modellname, der an Ollama weitergereicht wird.
- `PORT` - Optionaler Port (Standard: `3000`).
- `NODE_ENV` - Optional (`production` oder `development`).

## Weitere Hinweise
- Bei fehlenden Variablen protokolliert der Server Warnungen, deaktiviert aber nur die betroffenen Routen.
- Fuer Tests und lokale Entwicklung kann CORS offen bleiben; fuer produktive Setups sollte der erlaubte Ursprung eingeschraenkt werden (siehe `proxy/src/server.mjs`).

