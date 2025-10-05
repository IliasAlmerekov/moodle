# Team-Setup: Moodle + Ollama Stack auf Raspberry Pi

## Überblick

Dieses Dokument beschreibt den vollständigen Aufbau des aktuellen Stacks:

- Raspberry Pi 5 mit 64-bit Raspberry Pi OS
- Docker, Docker Compose v2 und Portainer
- Docker-Compose-Stack mit MariaDB, Moodle und Fastify-Proxy
- Externer Ollama-Server (Windows 11 Laptop) für das LLM
- Grundkonfiguration von Moodle inklusive deutscher Lokalisierung und Webservice-Token

## Voraussetzungen

- Raspberry Pi 5 (oder vergleichbar) mit Raspberry Pi OS 64-bit (frisch installiert)
- Zugriff per SSH oder direktes Terminal
- Windows 11 Laptop (oder anderes System) für Ollama
- Stabile Netzwerkverbindung; Pi und Laptop im selben LAN

IPs anpassen:

- Raspberry Pi: `192.168.178.49` am Raspberry "ifconfig"
- Windows-Laptop: `192.168.178.35` am Windows "ipconfig"

## Raspberry Pi: Basis vorbereiten

1. System aktualisieren und neu starten:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo reboot
   ```
2. Nach dem Reboot wieder anmelden.

## Docker & Docker Compose installieren

1. Docker Engine installieren:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```
2. Docker testen:
   ```bash
   docker version
   docker run hello-world
   ```
3. Docker Compose v2 als CLI-Plugin installieren:
   ```bash
   DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
   mkdir -p "$DOCKER_CONFIG/cli-plugins"
   curl -SL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64 \
     -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
   chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
   docker compose version
   ```

## Portainer bereitstellen

```bash
docker volume create portainer_data
docker run -d \
  -p 8000:8000 \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Portainer ist anschließend unter `https://<PI-IP>:9443` erreichbar.

## Projektstruktur

```
~/moodle
+-- .env
+-- compose/
   +-- docker-compose.yml
+-- data/
  +-- mariadb/
  +-- moodle/
  +-- moodledata/
  +-- moodle-init/ (Init-Skripte, optional)
+-- proxy/
    +-- Dockerfile
    +-- package.json
    +-- src/server.mjs
```

## .env konfigurieren

Wichtige Variablen (Beispielwerte):

```
# MariaDB
MARIADB_USER=bn_moodle
MARIADB_PASSWORD=<sicheres_passwort>
MARIADB_DATABASE=bitnami_moodle
MARIADB_ROOT_PASSWORD=<root_passwort>

# Moodle Admin
MOODLE_USERNAME=admin
MOODLE_PASSWORD=<admin_passwort>

# Netzwerk
PI_LAN_IP=192.168.178.49 //anpassen
MOODLE_HTTP_PORT=8080
PROXY_PORT=3000

# LLM/Ollama
OLLAMA_URL=http://192.168.178.35:11434 //anpassen
OLLAMA_MODEL=llama3

# Moodle REST
MOODLE_URL=http://192.168.178.49:8080 //anpassen
MOODLE_TOKEN=<moodle_webservice_token>
```

## Docker-Compose-Stack

`compose/docker-compose.yml` definiert drei Services:

- `mariadb` (Bitnami-Legacy-Image, ARM64, persistente Daten unter `data/mariadb`)
- `moodle` (Bitnami-Legacy-Image, Ports auf 8080 gemappt, Daten unter `data/moodle*`)
- `proxy` (Fastify-Anwendung aus `proxy/`, lauscht auf Port 3000)

Der Proxy erhält per Umgebung die URLs für Moodle und Ollama sowie den Moodle-Token. Alle Services liegen im selben Bridge-Netz `moodle_net`.

## Datenverzeichnisse vorbereiten

MariaDB erwartet Schreibrechte für UID/GID `1001`:

```bash
mkdir -p ~/moodle/data/mariadb
sudo chown -R 1001:1001 ~/moodle/data/mariadb
sudo chmod -R 775 ~/moodle/data/mariadb
```

Die Verzeichnisse für Moodle werden beim ersten Start automatisch angelegt.

## Stack starten

```bash
cd ~/moodle/compose
docker compose --env-file ../.env up -d
```

Status prüfen:

```bash
docker compose --env-file ../.env ps
docker compose --env-file ../.env logs -f mariadb
docker compose --env-file ../.env logs -f moodle
```

Erst wenn MariaDB in `running` ist, schließt Moodle seine Installation ab.

## Moodle: Erstkonfiguration

1. Nach 3-4 Minuten ist Moodle unter `http://<PI-IP>:8080` erreichbar.
2. Mit `admin` / `MOODLE_PASSWORD` einloggen.
3. Grundeinstellungen (Site-Name, Zeitzone, Support-E-Mail) setzen.
4. SMTP konfigurieren, falls Mails benötigt werden.
5. Standardrollen/Benutzer anlegen (Site administration > Users > Accounts).

## Deutsche Lokalisierung

1. Sprachpakete installieren: Site administration > General > Language > Language packs > `Deutsch (de)`.
2. Default-Sprache setzen: Language settings > `Default language = Deutsch (de)`.
3. Autodetect optional deaktivieren, wenn Browser-Einstellungen ignoriert werden sollen.
4. Cache leeren: Site administration > Development > Purge caches.
5. Falls Moodle warnt, dass die Lokale fehlt, einmal im Container ausführen:
   ```bash
   sudo docker compose --env-file ../.env exec moodle bash
   echo 'de_DE.UTF-8 UTF-8' >> /etc/locale.gen
   echo 'de_DE@formal UTF-8' >> /etc/locale.gen
   locale-gen de_DE.UTF-8 de_DE@formal
   update-locale LANG=de_DE.UTF-8 LANGUAGE=de_DE.UTF-8 LC_ALL=de_DE.UTF-8
   exit
   sudo docker compose --env-file ../.env restart moodle
   ```

## Webservices & Token

1. Site administration > General > Advanced features > `Enable web services` aktivieren.
2. Site administration > Server > Web services > Manage protocols > `REST` aktivieren.
3. Manage services: vorhandenen Dienst `Moodle mobile web service` verwenden oder eigenen anlegen.
4. Manage tokens > `Create token` > Benutzer `admin`, Dienst wählen > Token kopieren.
5. Token in `.env` (`MOODLE_TOKEN`) eintragen und Proxy neu starten:
   ```bash
   docker compose --env-file ../.env restart proxy
   ```

## Proxy-Service (Fastify)

- Läuft als eigener Container, baut auf Node.js 20 auf.
- Endpunkte:
  - `GET /health` ? Gesamtstatus (prüft, ob Moodle/Ollama konfiguriert sind)
  - `GET /moodle/ping` ? HEAD-Anfrage an Moodle
  - `GET /ollama/models` ? Liste der verfügbaren Ollama-Modelle
- Log-Level hängt von `NODE_ENV` ab (in Produktion `info`).

## Ollama auf Windows 11

1. Installer von [https://ollama.com/download](https://ollama.com/download) ausführen.
2. Modelle laden:
   ```powershell
   ollama pull llama3
   ollama list
   ```
3. API nach außen öffnen:
   ```powershell
   setx OLLAMA_HOST http://0.0.0.0:11434
   ```
   PowerShell neu öffnen und Server starten (bleibt offen):
   ```powershell
   ollama serve
   ```
   Alternativ per Task Scheduler als Hintergrunddienst ausführen.
4. Firewall-Regel für TCP 11434 erstellen (eingehend erlauben).
5. Vom Pi prüfen:
   ```bash
   curl http://192.168.178.35:11434/api/tags
   ```
   Output zeigt verfügbare Modelle (z.B. `llama3`).

## Proxy testen

Vom Laptop:

```bash
curl http://192.168.178.49:3000/health
curl http://192.168.178.49:3000/moodle/ping
curl http://192.168.178.49:3000/ollama/models
```

Beispiel für POST (PowerShell):

```powershell
Invoke-RestMethod -Uri http://192.168.178.49:3000/api/chat `
  -Method Post `
  -Body '{"message":"Hallo, Moodle!"}' `
  -ContentType 'application/json'
```

Antwort zeigt aktuell noch den Echo-Platzhalter.

## Wartung & Troubleshooting

- Stack neu starten: `docker compose --env-file ../.env down` dann wieder mit `up -d`
- Nur Proxy neu starten: `docker compose --env-file ../.env restart proxy`
- Logs ansehen: `docker compose --env-file ../.env logs -f <service>`
- Daten sichern: Verzeichnisse `data/mariadb`, `data/moodle`, `data/moodledata` regelmäßig sichern.
- Portainer nutzen, um Container zu überwachen oder Stacks neu zu deployen.

## Nächste Schritte

- In `proxy/src/server.mjs` die tatsächliche Logik für `/api/chat` implementieren (Moodle-REST-Aufrufe, Ollama-Interaktion, Antwortlogik).
- Rollenkonzept in Moodle ausarbeiten (nicht mit Admin-Token in Produktion arbeiten).
- Optional HTTPS/Reverse Proxy vor Moodle/Proxy setzen.
