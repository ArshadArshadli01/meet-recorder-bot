# Deploying and running meet-bot

This guide is for anyone cloning the repo: local development, self-hosted production, or understanding what each variable in [`.env.example`](../.env.example) does and **where to obtain secrets**.

---

## If you maintain the open-source project

You can:

1. **Host a public demo** on your own VPS or PaaS so people can try the UI without installing anything. Keep it clearly labeled “demo”, rate-limit or disable destructive actions, and **never** ship real user data or shared Google OAuth credentials in public docs.
2. **Document one blessed path** (for example Docker Compose + HTTPS) so contributors are not guessing—this file is that path.
3. **Separate secrets from code**: commit only `.env.example`; real `.env` stays on the server. Rotate keys if they leak.
4. **License and expectations**: ensure `LICENSE` matches how you want others to use Meet recording (legal/compliance is on the operator).

Self-hosters run **their own** Google Cloud OAuth app, MySQL, Redis, and optional Spaces/FCM—your demo instance uses **your** keys, not theirs.

---

## What you are deploying

| Component | Role | Typical port |
|-----------|------|----------------|
| **API** (`apps/api`) | HTTP API, OAuth callbacks, queues jobs | `3000` |
| **Worker** (`apps/worker`) | BullMQ consumer: Playwright + recording | (no public port) |
| **Dashboard** (`apps/dashboard`) | Next.js UI | `4000` |
| **Redis** | BullMQ backend | `6379` (Compose maps `6380` on host) |
| **MySQL** | Accounts, tokens metadata | `3306` (Compose maps `3307` on host) |

Copy [`.env.example`](../.env.example) to `.env` at the **repository root** and edit values there. Defaults are documented in `apps/api/src/config.ts` (as noted in `.env.example`).

### Concurrent recordings

- One **worker process** defaults to **`WORKER_CONCURRENCY=1`**: it finishes one BullMQ job before starting the next full recording (each job holds Playwright/Chromium and often ffmpeg — hundreds of MB RAM each).
- To serve **more users at the same time**, run **multiple worker replicas** (e.g. Docker Compose `deploy.replicas`, Kubernetes replicas, or several VMs each running one worker). Total approximate parallelism ≈ `(number of worker processes) × WORKER_CONCURRENCY`. Raising concurrency above 1 on a single machine only helps if you have enough CPU/RAM and accept overlapping browsers; prefer horizontal scaling for isolation.

---

## Prerequisites

- **Node.js ≥ 20** (see each app’s `package.json` `engines`) if you run apps outside Docker.
- **Docker + Docker Compose** for the recommended full stack.
- For **dashboard login**: Google OAuth web client + HTTPS-friendly `PUBLIC_BASE_URL` in production.
- For **push notifications**: Firebase project (optional).

---

## Tutorial: run with Docker Compose

From the repository root:

```bash
cp .env.example .env
```

### 1. Minimum secrets for a working stack

Edit `.env` and set at least:

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Signs cookies — generate (see below). |
| `TOKEN_ENC_KEY` | Encrypts refresh tokens in Redis — generate. |
| `DATA_ENC_KEY` | Encrypts sensitive DB fields — generate. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Dashboard login — [Google Cloud Console](https://console.cloud.google.com/). |
| `PUBLIC_BASE_URL` | Must match the URL users use for the **API** (OAuth redirects). |
| `DASHBOARD_ORIGIN` | URL of the Next.js app (CORS / links). |

Generate random secrets (examples):

```bash
# Linux / macOS / Git Bash on Windows
openssl rand -hex 32    # SESSION_SECRET
openssl rand -base64 32 # TOKEN_ENC_KEY
openssl rand -base64 32 # DATA_ENC_KEY
```

Google OAuth setup (authorized origins, redirect URIs) is step-by-step in [Google Cloud setup](google-cloud-setup.md).

### 2. Optional: object storage (DigitalOcean Spaces)

If `DO_SPACES_KEY`, `DO_SPACES_SECRET`, and `DO_SPACES_BUCKET` are **empty**, uploads to Spaces are disabled (recordings can still live on disk under `DATA_DIR`). See [DigitalOcean Spaces](#digitalocean-spaces-do_spaces_) below.

### 3. Optional: Firebase (dashboard push)

Leave `FCM_*` and `NEXT_PUBLIC_FIREBASE_*` empty if you do not need push; fill them from one Firebase project if you do.

### 4. Build and start

```bash
docker compose up -d --build
```

### 5. Open the apps

- API: `http://localhost:3000` (or your server’s hostname).
- Dashboard: `http://localhost:4000`.

Compose maps **MySQL** to host port **3307** and **Redis** to **6380** (see [`docker-compose.yml`](../docker-compose.yml)).

### 6. Logs

```bash
docker compose logs -f api worker dashboard
```

First boot runs DB migrations automatically (see README).

---

## Production checklist (short)

- Use **HTTPS** and set `PUBLIC_BASE_URL` and `DASHBOARD_ORIGIN` to real `https://…` origins.
- Register the same API origin and OAuth redirect URIs in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
- In Compose, the dashboard must reach the API by Docker service name (`INTERNAL_API_BASE_URL` is set in [`docker-compose.yml`](../docker-compose.yml)); do not point it at `localhost` inside the dashboard container.
- Put MySQL/Redis behind firewalls; use strong passwords (`MYSQL_PASSWORD` / `DB_PASSWORD`).
- Restrict who can reach the worker network path if the worker runs on a separate machine.

---

## Environment variables — where each value comes from

Below, “**Required for login**” means Google OAuth + session/token/crypto vars from the [Minimum secrets](#1-minimum-secrets-for-a-working-stack) table.

### Core URLs and ports

| Variable | Where to get it |
|----------|-----------------|
| `PORT` | Your choice; default `3000`. Must match how you expose the API. |
| `DASHBOARD_PORT` | Local dev port for Next.js; Compose uses image CMD. |
| `DASHBOARD_ORIGIN` | Full origin of the dashboard, e.g. `https://meet.example.com` if the UI is there. |
| `PUBLIC_BASE_URL` | Full origin of the **API** as seen in the browser, e.g. `https://api.example.com`. Must match Google OAuth “Authorized redirect URIs”. |

### Redis (`REDIS_*`)

| Variable | Where to get it |
|----------|-----------------|
| `REDIS_URL` | Single URL wins, e.g. `redis://:password@host:6379`. From your Redis host or managed Redis provider. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Used if `REDIS_URL` is unset; same source as above. |

### Data and queue

| Variable | Where to get it |
|----------|-----------------|
| `DATA_DIR` | Filesystem path on the API/worker host; recordings under `{DATA_DIR}/recordings`. Docker Compose uses `/data`. |
| `QUEUE_NAME` | Your choice; must be identical for API and worker (default `meet-record`). |

### Meeting / video / worker tuning

Most `MEET_*`, `MEETING_*`, `VIDEO_*`, `BULLMQ_*` entries are **defaults** you only change for timeouts, recording quality, Linux vs Windows audio, or long meetings. See comments in [`.env.example`](../.env.example). No external service signup required.

### DigitalOcean Spaces (`DO_SPACES_*`)

Used for S3-compatible uploads. **Leave key/secret/bucket empty** to disable Spaces.

| Variable | Where to get it |
|----------|-----------------|
| `DO_SPACES_KEY` | [DigitalOcean Control Panel](https://cloud.digitalocean.com/) → **API** → **Spaces keys** → Create key (access key id). |
| `DO_SPACES_SECRET` | Same flow — secret for that key. |
| `DO_SPACES_BUCKET` | **Spaces** → your Space name (bucket). Create a Space in the region you want. |
| `DO_SPACES_REGION` | Region slug for that Space, e.g. `fra1`, `nyc3` (listed when you create the Space). |
| `DO_SPACES_ENDPOINT` | Optional. Default pattern: `https://{region}.digitaloceanspaces.com` (see `.env.example` commented lines). |
| `DO_SPACES_PUBLIC_URL` | Optional CDN or public origin for objects, e.g. `https://{bucket}.{region}.digitaloceanspaces.com` — set if you use a custom CDN or non-default hostname. |

Official overview: [DigitalOcean Spaces documentation](https://docs.digitalocean.com/products/spaces/).

### Google OAuth and encryption (`PUBLIC_BASE_URL`, `GOOGLE_*`, `SESSION_SECRET`, `TOKEN_ENC_KEY`, `DATA_ENC_*`)

| Variable | Where to get it |
|----------|-----------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client ID (Web application). |
| `SESSION_SECRET` | Generate locally (`openssl rand -hex 32`). |
| `TOKEN_ENC_KEY` | Generate (`openssl rand -base64 32`); encrypts refresh tokens at rest. |
| `DATA_ENC_KEY` / `DATA_ENC_KEY_VERSION` | Generate key; version string for rotation (e.g. `v1`). |

Walkthrough: [Google Cloud setup](google-cloud-setup.md).

### MySQL (`DB_*` / `MYSQL_*`)

| Variable | Where to get it |
|----------|-----------------|
| `DB_*` | Preferred names in app code; set host, port, user, password, database name. |
| `MYSQL_*` | Fallback aliases; same values if both are present. |
| `MYSQL_SSL` | `true` when your provider requires TLS (many managed MySQL products). |

With Docker Compose, defaults match `docker-compose.yml` (`mysql` service, user `root`, password from `MYSQL_PASSWORD`).

### Firebase Cloud Messaging — server (`FCM_*`)

| Variable | Where to get it |
|----------|-----------------|
| `FCM_PROJECT_ID` | [Firebase Console](https://console.firebase.google.com/) → Project settings → General. |
| `FCM_CLIENT_EMAIL` | Firebase → Project settings → Service accounts → Generate new private key (JSON); field `client_email`. |
| `FCM_PRIVATE_KEY` | Same JSON; private key. In `.env`, use `\n` for line breaks inside the PEM. |

### Firebase — dashboard client (`NEXT_PUBLIC_*`)

These are **public** (embedded at build time). From Firebase Console → Project settings → **Your apps** → Web app config:

| Variable | Typical source |
|----------|----------------|
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible API URL, e.g. `https://api.example.com`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web app `apiKey`. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain`. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId`. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId`. |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase Console → Project settings → Cloud Messaging → Web Push certificates (VAPID key pair). |

Rebuild the dashboard image after changing `NEXT_PUBLIC_*` values.

---

## Local development without Docker (summary)

Each app has its own `node_modules`. From repo root, see [README](../README.md): run `apps/api`, `apps/dashboard` with `npm install` + `npm run dev`. The **worker** for real recording is aimed at **Linux** (Xvfb/Pulse); on Windows/macOS use the Docker worker as documented in the README.

---

## Related files

- [`.env.example`](../.env.example) — full list with inline comments.
- [Google Cloud setup](google-cloud-setup.md) — OAuth client and redirect URIs.
- [`docker-compose.yml`](../docker-compose.yml) — service wiring and ports.
