# Quick Start — From Zero to Running in 15 Minutes

This guide walks you through getting the Moodle AI Chatbot running on a fresh Linux server.
No prior Docker experience needed — just follow each step in order.

---

## What You Need Before You Start

- A Linux server (Ubuntu 22.04 / Debian 12 recommended), or a Windows machine with WSL2
- At least **10 GB of free disk space** (Moodle + the LLM model are large)
- The server needs internet access for the initial setup
- A domain name pointing to your server (only needed if you want HTTPS / public access)

---

## Step 1 — Install Docker

Docker is the tool that runs everything. Skip this step if Docker is already installed
(`docker --version` returns a version number).

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Add yourself to the `docker` group so you don't have to type `sudo` every time:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verify it works:

```bash
docker --version
# Should print something like: Docker version 26.x.x, build ...
```

---

## Step 2 — Get the Code

```bash
git clone <repo-url>
cd raspi
```

> If you don't have `git`, install it first: `sudo apt install git`

---

## Step 3 — Create Your Configuration File

Copy the template configuration file:

```bash
cp .env.example .env
```

Now open `.env` in a text editor and fill in the required values.
There are many settings, but you only **must** change these five to get started:

| Setting | What to put there | Example |
|---------|-------------------|---------|
| `MOODLE_PASSWORD` | A password for the Moodle admin account | `MySchool2026!` |
| `MARIADB_PASSWORD` | A password for the database | `DbPass2026!` |
| `MARIADB_ROOT_PASSWORD` | A root password for the database | `RootPass2026!` |
| `CHATBOT_AUTH_SECRET` | A random secret (generate it below) | see command below |
| `CHAT_ENCRYPTION_KEY` | A random encryption key (generate it below) | see command below |

**Generate the two secrets** by running these commands and pasting the output into `.env`:

```bash
# For CHATBOT_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# For CHAT_ENCRYPTION_KEY
openssl rand -hex 32
```

> If `node` is not installed yet, that's fine — you can also generate the value
> with: `cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64`

**Example of what your `.env` should look like after filling it in:**

```
MOODLE_PASSWORD=MySchool2026!
MARIADB_PASSWORD=DbPass2026!
MARIADB_ROOT_PASSWORD=RootPass2026!
CHATBOT_AUTH_SECRET=a3f8c1...  ← your generated value
CHAT_ENCRYPTION_KEY=9e2d4b...  ← your generated value
```

Leave everything else at the default values for now.

---

## Step 4 — Start Everything

```bash
cd compose
docker compose --env-file ../.env up -d
```

This downloads and starts five services: Moodle, MariaDB, Ollama, the AI proxy, and nginx.
The first run takes **3–5 minutes** because Docker downloads the images.

Watch the progress:

```bash
docker compose ps
```

Wait until all containers show `healthy` or `running` in the STATUS column.
Moodle takes the longest — watch its logs if you want to see when it is ready:

```bash
docker compose logs -f moodle
# Wait until you see "Apache started" or similar, then press Ctrl+C
```

---

## Step 5 — Download the AI Model

The chatbot needs a language model to generate answers. Download it once (~2 GB):

```bash
docker exec -it ollama ollama pull llama3.2:3b
```

This may take a few minutes depending on your internet speed.

---

## Step 6 — Get the Moodle Token

The proxy needs a token to talk to Moodle. You get it from the Moodle admin panel.

**If you started the demo stack (step 4), Moodle is at `http://localhost:8080`.**

1. Open `http://localhost:8080` in your browser
2. Log in with username `admin` and the `MOODLE_PASSWORD` you set in `.env`
3. Go to: **Site administration → Server → Web services → Overview**
4. Work through the checklist on that page:
   - Enable web services: ✓
   - Enable REST protocol: ✓
   - Select service: `Moodle mobile web service`
   - Assign `admin` to the service
5. Go to: **Site administration → Server → Web services → Manage tokens**
6. Click **Add** → select user `admin` and service `Moodle mobile web service` → save
7. Copy the token that appears in the list

**Add the token to your `.env`:**

```
MOODLE_TOKEN=<paste your token here>
```

**Restart the proxy to pick up the new token:**

```bash
docker compose restart proxy
```

---

## Step 7 — Verify Everything Works

Check that the proxy is healthy and connected to both Moodle and Ollama:

```bash
curl http://localhost:3000/health
```

You should see something like:

```json
{
  "status": "ok",
  "services": { "moodle": "ok", "ollama": "ok" }
}
```

If `moodle` shows `"degraded"` — double-check your `MOODLE_TOKEN` and restart the proxy.  
If `ollama` shows `"degraded"` — make sure the model finished downloading (Step 5).

---

## Step 8 — Open the Chatbot

The widget is at:

```
http://localhost:3000/chatbot/
```

Open it in your browser and try asking a question. If the bot answers, you are done!

---

## What's Next

| Goal | What to do |
|------|-----------|
| Embed the chatbot in a Moodle course page | See [`proxy/public/chatbot/moodle-embed.html`](proxy/public/chatbot/moodle-embed.html) for the embed snippet |
| Set up HTTPS with a real domain | See [`docs/setup.md`](docs/setup.md) — section "SSL-Zertifikat erstellen" |
| Change the AI model | Set `OLLAMA_MODEL=<model>` in `.env`, pull the model, restart proxy |
| Back up your data | Run `compose/backup-moodle.sh` — backs up Moodle, MariaDB, and chat history |
| Read the full architecture | See [`ARCHITECTURE.md`](ARCHITECTURE.md) |

---

## Common Problems

### "Error: Missing required env var: MOODLE_TOKEN"
The proxy started before you set the token. Set `MOODLE_TOKEN` in `.env` and run:
```bash
cd compose && docker compose restart proxy
```

### "Error: Missing required environment variable: CHAT_ENCRYPTION_KEY"
You didn't generate the encryption key. Run:
```bash
openssl rand -hex 32
```
Paste the result as `CHAT_ENCRYPTION_KEY=...` in `.env`, then restart the proxy.

### Chat hangs and never responds
The model is probably not downloaded yet. Check with:
```bash
docker exec ollama ollama list
```
If the list is empty, run Step 5 again.

### CORS error in the browser
The Moodle page origin is not in `CORS_ORIGIN`. Add it:
```
CORS_ORIGIN=http://localhost:8080,https://your-moodle-domain.com
```
Then restart proxy.

---

> For deeper operational procedures (SSL, backups, model swaps, recovery),
> see [`docs/setup.md`](docs/setup.md).
