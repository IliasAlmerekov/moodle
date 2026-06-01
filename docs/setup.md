# Betriebshandbuch: Moodle AI Chatbot

Dieses Dokument beschreibt die Erstinstallation sowie alle wiederkehrenden Betriebsprozeduren.

---

## Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Erstinstallation](#erstinstallation)
- [Betriebsprozeduren](#betriebsprozeduren)
  - [1. Moodle Webservice-Token ausstellen](#1-moodle-webservice-token-ausstellen)
  - [2. Ollama-Modell wechseln](#2-ollama-modell-wechseln)
  - [3. Neuen Administrator anlegen](#3-neuen-administrator-anlegen)
  - [4. Disaster Recovery](#4-disaster-recovery)
  - [5. SSL-Zertifikat erneuern](#5-ssl-zertifikat-erneuern)
- [Wartung](#wartung)

---

## Voraussetzungen

| Komponente | Version | Hinweis |
|------------|---------|---------|
| OS | Linux x86_64 | WSL2 funktioniert ebenfalls |
| Docker | 24+ | Compose-Plugin erforderlich |
| certbot | aktuell | Nur für SSL benötigt: `sudo apt install certbot` |
| Ports 80, 443 | frei | Müssen aus dem Internet erreichbar sein (Router/Firewall) |

---

## Erstinstallation

### 1. Docker installieren

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
docker version
```

### 2. Projekt klonen und konfigurieren

```bash
git clone <repo-url> && cd raspi
cp .env.example .env
# .env öffnen und alle Variablen befüllen (Passwörter, Token, Domain)
```

Alle Variablen sind in [`.env.example`](../.env.example) kommentiert.

### 3. SSL-Zertifikat erstellen (einmalig)

Ports 80 und 443 müssen erreichbar sein, bevor nginx gestartet wird:

```bash
cd compose
bash setup-ssl.sh
```

Das Skript liest `NGINX_DOMAIN` und `CERTBOT_EMAIL` aus `.env` und speichert das Zertifikat unter `data/certbot/`.

### 4. Stack starten

```bash
cd compose
docker compose --env-file ../.env up -d
```

Status prüfen:

```bash
docker compose ps
docker compose logs -f moodle    # Moodle benötigt beim ersten Start 3–4 Minuten
```

### 5. Moodle-Erstkonfiguration

1. `http://localhost:8080` öffnen und als `admin` einloggen (Passwort: `MOODLE_PASSWORD` aus `.env`).
2. Grundeinstellungen setzen: Site-Name, Zeitzone, Support-E-Mail.
3. Sprache: *Websiteverwaltung → Allgemein → Sprache → Sprachpakete → Deutsch (de)* installieren.
4. Webservice-Token für den Proxy ausstellen (siehe [Prozedur 1](#1-moodle-webservice-token-ausstellen)).

### 6. Proxy verifizieren

```bash
curl http://localhost:3000/health
# Erwartete Antwort: {"status":"ok","uptime":...}
```

---

## Betriebsprozeduren

---

### 1. Moodle Webservice-Token ausstellen

**Wann:** Ersteinrichtung, Token abgelaufen, Token kompromittiert.

**Schritte:**

1. In Moodle als `admin` einloggen.
2. *Websiteverwaltung → Server → Webservices → Übersicht* öffnen.
3. Schritt-für-Schritt-Assistent (falls noch nicht aktiviert):
   - Webservices aktivieren: ✓
   - REST-Protokoll aktivieren: ✓
   - Dienst auswählen: `Moodle mobile web service`
   - Benutzer `admin` dem Dienst zuweisen
4. *Websiteverwaltung → Server → Webservices → Token verwalten → Token erstellen*:
   - Benutzer: `admin`
   - Dienst: `Moodle mobile web service`
   - Token kopieren
5. Token in `.env` eintragen:
   ```
   MOODLE_TOKEN=<kopierter_token>
   ```
6. Proxy neu starten:
   ```bash
   cd compose && docker compose restart proxy
   ```
7. Verbindung prüfen:
   ```bash
   curl http://localhost:3000/health
   ```

---

### 2. Ollama-Modell wechseln

**Wann:** Neues Modell testen, Modell aktualisieren, Speicherplatz sparen.

**Schritte:**

1. Verfügbare Modelle anzeigen:
   ```bash
   docker exec ollama ollama list
   ```

2. Neues Modell laden (Beispiel: `llama3.2:3b` → `gemma3:4b`):
   ```bash
   docker exec ollama ollama pull gemma3:4b
   ```
   Der Download kann je nach Modell 2–8 GB groß sein.

   Cloud-Modelle wie `gpt-oss:120b-cloud` laufen über Ollama Cloud. Dafür muss der
   Ollama-Container mindestens Version 0.12 verwenden und einmal angemeldet werden:
   ```bash
   docker exec -it ollama ollama signin
   docker exec ollama ollama pull gpt-oss:120b-cloud
   ```
   Der `pull` lädt bei Cloud-Modellen nicht die 120B-Gewichte lokal, sondern macht
   das Modell im lokalen Ollama-Server verfügbar.

3. Modell in `.env` setzen:
   ```
   OLLAMA_MODEL=gemma3:4b
   ```

4. Proxy neu starten (liest `OLLAMA_MODEL` beim Start):
   ```bash
   cd compose && docker compose restart proxy
   ```

5. Funktion prüfen:
   ```bash
   curl http://localhost:3000/ollama/models
   # Neues Modell muss in der Liste erscheinen
   ```

6. Altes Modell bei Bedarf entfernen (gibt Speicher frei):
   ```bash
   docker exec ollama ollama rm llama3.2:3b
   ```

---

### 3. Neuen Administrator anlegen

**Wann:** Teamwechsel, neuer technischer Ansprechpartner.

**Moodle-Administrator (hat Zugriff auf alle Moodle-Einstellungen):**

1. Als bestehender `admin` einloggen.
2. *Websiteverwaltung → Nutzer/innen → Konten → Nutzer/in anlegen*:
   - Vorname, Nachname, E-Mail, Benutzername, Passwort ausfüllen
   - Speichern
3. *Websiteverwaltung → Nutzer/innen → Berechtigungen → Systemrollen zuweisen*:
   - Rolle `Manager` oder `Administrator` wählen
   - Neuen Benutzer zuweisen
4. Falls der neue Admin auch den Proxy-Token verwalten soll: Webservice-Token für diesen Benutzer erstellen (siehe [Prozedur 1](#1-moodle-webservice-token-ausstellen)).

**Server-Zugang (SSH/Docker):**

```bash
# Benutzer anlegen
sudo adduser <username>
# Docker-Gruppe zuweisen (erlaubt docker-Befehle ohne sudo)
sudo usermod -aG docker <username>
```

---

### 4. Disaster Recovery

**Wann:** Datenverlust, Servermigration, defekter Host.

#### Backup erstellen

Regelmäßige Backups laufen über `compose/backup-moodle.sh`:

```bash
cd compose
bash backup-moodle.sh /pfad/zum/backup-verzeichnis
# Erstellt: moodle-backup-YYYYMMDD_HHMMSS.tar.gz
```

Das Archiv enthält `data/mariadb/`, `data/moodle/`, `data/moodledata/` und `data/chat.db`. SSL-Zertifikate werden ausgelassen (können jederzeit neu ausgestellt werden).

**Empfehlung:** Täglich per Cron auf externen Speicher sichern:
```bash
# /etc/cron.d/moodle-backup
0 3 * * * root /home/admin/raspi/compose/backup-moodle.sh /mnt/backup
```

#### Wiederherstellung

1. Stack stoppen:
   ```bash
   cd compose && docker compose down
   ```

2. Aus Backup wiederherstellen:
   ```bash
   bash restore-moodle.sh /pfad/zum/moodle-backup-YYYYMMDD_HHMMSS.tar.gz
   ```

3. Stack starten:
   ```bash
   docker compose up -d
   ```

4. Nach ~60 Sekunden prüfen:
   ```bash
   curl http://localhost:3000/health
   ```

**Bei Migration auf neuen Server:** Vor dem Restore `.env` anpassen (neue IP/Domain), dann SSL-Zertifikat für neue Domain neu ausstellen (`bash setup-ssl.sh`).

---

### 5. SSL-Zertifikat erneuern

**Wann:** Zertifikat läuft ab (certbot warnt 30 Tage vorher per E-Mail), Domain hat sich geändert.

#### Automatische Erneuerung

certbot installiert beim Erstausstellen automatisch einen systemd-Timer oder Cron-Job, der alle 60 Tage erneuert. nginx muss nach der Erneuerung neu geladen werden:

```bash
# In Crontab eintragen (falls certbot nginx nicht automatisch neu lädt):
0 3 * * 1 docker compose -f /home/admin/raspi/compose/docker-compose.yml exec nginx nginx -s reload
```

#### Manuelle Erneuerung

```bash
# 1. Zertifikat erneuern (certbot läuft standalone, kurzer nginx-Ausfall)
cd compose && docker compose stop nginx
sudo certbot renew \
  --config-dir ../data/certbot \
  --work-dir   ../data/certbot/work \
  --logs-dir   ../data/certbot/logs

# 2. nginx neu starten
docker compose start nginx

# 3. Prüfen
curl -I https://${NGINX_DOMAIN}/health
```

#### Neues Zertifikat für geänderte Domain

```bash
# 1. Neue Domain in .env setzen: NGINX_DOMAIN=neue-domain.de und PUBLIC_MOODLE_URL
# 2. Stack stoppen
cd compose && docker compose down
# 3. Zertifikat für neue Domain ausstellen
bash setup-ssl.sh
# 4. Stack starten
docker compose up -d
```

---

## Wartung

| Aufgabe | Befehl |
|---------|--------|
| Nur Proxy neu starten | `docker compose restart proxy` |
| Alle Container neu starten | `docker compose down && docker compose up -d` |
| Logs live verfolgen | `docker compose logs -f proxy` |
| Container-Status | `docker compose ps` |
| Moodle-Cache leeren | Moodle-Admin → *Entwicklung → Caches leeren* |
| Proxy-Cache leeren | `curl -X POST http://localhost:3000/admin/cache/invalidate` |
| Speicherverbrauch prüfen | `docker system df` |
| Ungenutzte Images entfernen | `docker image prune -f` |
