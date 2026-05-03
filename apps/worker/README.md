# meet-bot-worker

Self-contained Google Meet recording worker. Consumes BullMQ jobs from Redis, joins the meeting with Playwright, records video + audio with `ffmpeg` (Linux x11grab + Pulse), and uploads the result to S3-compatible object storage and/or Google Drive.

This folder does not depend on the rest of the meet-bot repo. To run the worker against your own backend, you only need to copy **this directory** and point the env vars at your own Redis and MySQL.

## Run with Docker (recommended)

```bash
cd apps/worker
docker build -t meet-bot-worker .
docker run --rm --shm-size=2g \
  --env-file ../../.env \
  -v meet-bot-recordings:/data \
  meet-bot-worker
```

The container entrypoint is [`docker-worker.sh`](docker-worker.sh) — it boots Xvfb (1920x1080), fluxbox, PulseAudio (`meet_bot_sink` + monitor), then `node dist/worker.js`.

## Run on a Linux host (without Docker)

```bash
cd apps/worker
npm install
npm run build
npm run migrate
DISPLAY=:99 npm start
```

Linux is required for the ffmpeg `x11grab + pulse` recording path. On Windows the worker can run for development (`npm run dev`) but produces silent WebM unless you configure WASAPI/DirectShow capture (`npm run ffmpeg:wasapi-devices` / `npm run ffmpeg:dshow-devices`).

## Job contract — enqueue from any backend

Your producer (any service that can talk to Redis) just needs to push a BullMQ job into the same queue:

- Queue name: `meet-record` (override with `QUEUE_NAME`).
- Job name: `record`.
- Payload: matches `MeetJobPayload` in [`src/types.ts`](src/types.ts):

```json
{
  "meeting_url": "https://meet.google.com/xxx-yyyy-zzz",
  "bot_name": "Meet Bot",
  "user_id": "optional — only set if you want Drive upload + per-user notifications",
  "save_to_drive": false,
  "save_to_spaces": true,
  "drive_folder_id": "optional Drive folder id"
}
```

Minimal Node.js producer (works with any backend):

```js
import { Queue } from "bullmq";
import IORedis from "ioredis";

const queue = new Queue("meet-record", {
  connection: new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }),
});

await queue.add("record", {
  meeting_url: "https://meet.google.com/xxx-yyyy-zzz",
  bot_name: "Meet Bot",
}, { jobId: "<uuid>", removeOnComplete: false, removeOnFail: false });
```

The worker writes the BullMQ `returnvalue` (matches `MeetJobResult` in [`src/types.ts`](src/types.ts)) when the job finishes — read it from your producer with `queue.getJob(id).then(j => j.returnvalue)`.

## Required env vars

Connection to your control plane:

- `REDIS_URL` — same Redis as the producer (default `redis://127.0.0.1:6379`).
- `QUEUE_NAME` — must match what the producer enqueues (default `meet-record`).
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` — the worker stores per-user data + notifications and runs migrations against this MySQL on boot. Reuse the API's MySQL or point at your own.
- `DATA_DIR` — where recordings are written before upload (default `/data`).

Object storage (optional — when set, the recording is also uploaded; otherwise the file stays on disk):

- `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION`, `DO_SPACES_ENDPOINT`, `DO_SPACES_PUBLIC_URL`.

Google Drive (optional — only used when the job has `user_id` + `save_to_drive: true`):

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `DATA_ENC_KEY`. The MySQL `users_secure` table must already contain a refresh token for the user — typically populated by the meet-bot API's OAuth flow.

Recording knobs (defaults work; tune as needed):

- `MEET_LINUX_RECORD_MODE=x11` (use ffmpeg x11grab+pulse → `meet-desktop.mp4`) or `playwright` (silent WebM + optional WAV mux).
- `MEET_FFMPEG_PATH=/usr/bin/ffmpeg` — system ffmpeg with the Pulse demuxer.
- `MEET_PULSE_SOURCE=meet_bot_sink.monitor` — pinned by `docker-worker.sh`.
- `VIDEO_WIDTH=1920`, `VIDEO_HEIGHT=1080` — Xvfb + recording resolution.
- `MEETING_MAX_SECONDS`, `JOIN_TIMEOUT_SECONDS`, `BULLMQ_LOCK_DURATION_MS`, `BULLMQ_STALLED_INTERVAL_MS`, `BULLMQ_MAX_STALLED_COUNT`.

See [`src/config.ts`](src/config.ts) for the full list with comments.

## What the worker writes to Redis

- Pub/Sub channel `meet-bot:events` — JSON events (`progress`, `state`, `completed`, `failed`, `notification`). Subscribe from your backend if you want live UI updates without polling. The schema is in [`src/realtime-events.ts`](src/realtime-events.ts).
- Cancel flag key `meet-bot:cancel:<jobId>` — set this from your backend to stop a recording in progress (the worker checks it during the loop). See [`src/job-cancel.ts`](src/job-cancel.ts).
- `meet-bot:times-in-meet:<jobId>` — set once the bot reaches the lobby/in-call (used by the API's `/bots/:id` snapshot, but you can read it too).
