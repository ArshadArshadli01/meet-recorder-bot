import { join } from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
}

function resolveRedisUrl(): string {
  const direct = process.env.REDIS_URL?.trim();
  if (direct) return direct;
  const host = process.env.REDIS_HOST?.trim() || "127.0.0.1";
  const port = process.env.REDIS_PORT?.trim() || "6379";
  const rawPassword = process.env.REDIS_PASSWORD?.trim();
  const password =
    rawPassword && rawPassword.toLowerCase() !== "null" ? `:${encodeURIComponent(rawPassword)}@` : "";
  return `redis://${password}${host}:${port}`;
}

export type SpacesConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
  /** Base URL for browsers (virtual-hosted style), e.g. https://bucket.fra1.digitaloceanspaces.com */
  publicBaseUrl: string;
};

export type MeetGotoWaitUntil = "commit" | "domcontentloaded" | "load" | "networkidle";

function parseMeetGotoWaitUntil(): MeetGotoWaitUntil {
  const v = (process.env.MEET_GOTO_WAIT_UNTIL ?? "networkidle").trim().toLowerCase();
  if (v === "commit" || v === "domcontentloaded" || v === "load" || v === "networkidle") return v;
  return "networkidle";
}

function loadSpacesConfig(): SpacesConfig | null {
  const accessKeyId = process.env.DO_SPACES_KEY?.trim();
  const secretAccessKey = process.env.DO_SPACES_SECRET?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  const region = process.env.DO_SPACES_REGION?.trim() ?? "fra1";
  const endpoint =
    process.env.DO_SPACES_ENDPOINT?.trim() ??
    `https://${region}.digitaloceanspaces.com`;

  const publicBaseUrl = (
    process.env.DO_SPACES_PUBLIC_URL?.trim() ??
    `https://${bucket}.${region}.digitaloceanspaces.com`
  ).replace(/\/$/, "");

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    region,
    bucket,
    publicBaseUrl,
  };
}

export const config = {
  port: Number(process.env.PORT ?? "3000"),
  dashboardPort: Number(process.env.DASHBOARD_PORT ?? "4000"),
  dashboardOrigin: (
    process.env.DASHBOARD_ORIGIN?.trim() || `http://localhost:${process.env.DASHBOARD_PORT ?? "4000"}`
  ).replace(/\/$/, ""),
  /** Docker Compose sets redis://redis:6379. Host dev: redis://127.0.0.1:6379 (requires dotenv + .env). */
  redisUrl: resolveRedisUrl(),
  dataDir: env("DATA_DIR", "/data"),
  queueName: process.env.QUEUE_NAME ?? "meet-record",
  meetingMaxSeconds: Number(process.env.MEETING_MAX_SECONDS ?? "3600"),
  /** How often we check for Meet end / leave UI while recording (ms). Lower = faster shutdown after host ends. */
  meetingEndPollMs: Number(process.env.MEETING_END_POLL_MS ?? "2500"),
  /**
   * After "Leave call" was visible, require this many polls where it stays hidden before treating
   * end-of-meeting text + missing Leave control as finished (avoids brief UI flicker).
   */
  meetingLeaveGonePolls: Number(process.env.MEETING_LEAVE_GONE_POLLS ?? "3"),
  joinTimeoutSeconds: Number(process.env.JOIN_TIMEOUT_SECONDS ?? "300"),
  /** Viewport + Linux x11grab size — defaults match meetingbot `SCREEN_WIDTH`/`SCREEN_HEIGHT` (1920×1080). */
  videoWidth: Number(process.env.VIDEO_WIDTH ?? "1920"),
  videoHeight: Number(process.env.VIDEO_HEIGHT ?? "1080"),
  headless: process.env.HEADLESS !== "false",
  /** Extra Chromium flags for Meet (fake mic/camera). Set MEET_USE_FAKE_MEDIA=false to test without. */
  meetUseFakeMedia: process.env.MEET_USE_FAKE_MEDIA !== "false",
  /** Max time for the first Meet page load (ms). Increase if Meet is slow from your network. */
  meetGotoTimeoutMs: Number(process.env.MEET_GOTO_TIMEOUT_MS ?? "120000"),
  /** meetingbot uses `networkidle`. Use `load` or `domcontentloaded` if navigation hangs (WS-heavy tabs). */
  meetGotoWaitUntil: parseMeetGotoWaitUntil(),
  /**
   * Use playwright-extra + puppeteer-extra-plugin-stealth (meetingbot-style).
   * Set MEET_STEALTH=false to use vanilla Playwright Chromium only.
   */
  meetStealth: process.env.MEET_STEALTH !== "false",
  /**
   * Linux containers must use an X11/Linux UA — a Windows UA + Linux Chromium is a strong bot signal.
   * Override with MEET_USER_AGENT if Meet blocks your IP regardless.
   */
  meetUserAgent:
    process.env.MEET_USER_AGENT?.trim() ??
    (process.platform === "win32"
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
  /** BullMQ job lock — Meet automation can run a long time; short locks cause "stalled" failures. */
  bullmqLockDurationMs: Number(process.env.BULLMQ_LOCK_DURATION_MS ?? "600000"),
  bullmqStalledIntervalMs: Number(process.env.BULLMQ_STALLED_INTERVAL_MS ?? "120000"),
  bullmqMaxStalledCount: Number(process.env.BULLMQ_MAX_STALLED_COUNT ?? "10"),
  spaces: loadSpacesConfig(),
  /**
   * If `meet-audio.wav` (or `audio.wav`) exists in the job folder after recording, run ffmpeg to mux with WebM → MP4.
   * Playwright cannot capture Meet audio by itself; see `.env.example` for capturing that WAV (ffmpeg / Pulse / Windows loopback).
   */
  meetAudioMux: process.env.MEET_AUDIO_MUX !== "false",
  /** Spawn ffmpeg to record session audio while Meet runs (Pulse on Linux, WASAPI on Windows). Requires ffmpeg on PATH. */
  meetCaptureParallelAudio: process.env.MEET_CAPTURE_AUDIO !== "false",
  meetFfmpegPath: process.env.MEET_FFMPEG_PATH?.trim() || "ffmpeg",
  /**
   * Linux PulseAudio device for `ffmpeg -f pulse -i …` (see meetingbot `getFFmpegParams`).
   * Use the **monitor** of the sink Chromium plays to (e.g. `…monitor`) to capture Meet audio, not the mic.
   * Docker `docker-worker.sh` sets this from `pactl get-default-sink` when unset.
   */
  meetPulseSource: process.env.MEET_PULSE_SOURCE?.trim() || "default",
  /**
   * Windows WASAPI device string for ffmpeg `-i` (example: `loopback`).
   * Note: many WinGet/Chocolatey "full" FFmpeg 8.x builds omit WASAPI; use `MEET_WINDOWS_AUDIO=dshow` instead.
   */
  meetWasapiDevice: process.env.MEET_WASAPI_DEVICE?.trim() || "",
  /**
   * Windows-only: `wasapi` (default) or `dshow`. Current Gyan FFmpeg 8.1 often has **no** WASAPI demuxer;
   * use `dshow` + Stereo Mix or a virtual cable — run `npm run ffmpeg:dshow-devices`.
   */
  meetWindowsAudio: (process.env.MEET_WINDOWS_AUDIO?.trim() || "wasapi").toLowerCase(),
  /**
   * DirectShow audio device for `-f dshow -i …` when `MEET_WINDOWS_AUDIO=dshow`.
   * Example: `Stereo Mix (Realtek(R) Audio)` or full `audio=Stereo Mix (...)` — from `npm run ffmpeg:dshow-devices`.
   */
  meetDshowAudio: process.env.MEET_DSHOW_AUDIO?.trim() || "",
  /**
   * Windows + DirectShow: refuse device names that look like microphones (records room audio, not Meet playback).
   * Set `false` only if you intentionally capture from a mic.
   */
  meetPlaybackAudioOnly: process.env.MEET_PLAYBACK_AUDIO_ONLY !== "false",
  /**
   * Linux only (Docker): `playwright` = silent WebM + optional WAV mux; `x11` = meetingbot-style ffmpeg
   * **x11grab + pulse** → single `meet-desktop.mp4` with audio (same idea as meetingbot `startRecording`).
   */
  meetLinuxRecordMode: (() => {
    const v = (process.env.MEET_LINUX_RECORD_MODE?.trim() || "playwright").toLowerCase();
    return v === "x11" ? "x11" : "playwright";
  })(),
  /**
   * In-call JSONL of chat lines (`artifacts/chat_messages.jsonl`) — best-effort scrape (Meet DOM varies).
   * Chat panel is opened via shortcut / buttons before scraping.
   */
  meetArtifactChat: process.env.MEET_ARTIFACT_CHAT !== "false",
  /** Minimum ms between chat scrapes while recording (0 = disable polling even if chat enabled). */
  meetArtifactChatPollMs: Number(process.env.MEET_ARTIFACT_CHAT_POLL_MS ?? "4000"),
  /** Opt-in: second ffmpeg (pulse→M4A) when Linux x11+pulse desktop capture is active. */
  meetArtifactSeparateAudio: process.env.MEET_ARTIFACT_SEPARATE_AUDIO === "true",
  /** After join: send F11 (+ Fullscreen API). Set `MEET_RECORDING_FULLSCREEN=false` to disable. */
  meetRecordingFullscreen: process.env.MEET_RECORDING_FULLSCREEN !== "false",
  /**
   * Opt-in Chromium `--kiosk` (no tabs/URL bar). Default off — meetingbot uses fluxbox + 1920×1080 + `--start-maximized` instead.
   * Set `MEET_RECORDING_KIOSK=true` for maximum chrome removal.
   */
  meetRecordingKiosk: process.env.MEET_RECORDING_KIOSK === "true",
  /** Inject CSS to blur-hide Meet bottom bars (fragile). Prefer MEET_RECORDING_CROP_BOTTOM_PX for a clean strip. */
  meetHideMeetControlsCss: process.env.MEET_HIDE_MEET_CONTROLS_CSS !== "false",
  /**
   * Linux x11 ffmpeg: crop this many pixels off the **bottom** of the grabbed desktop (removes control bar reliably).
   * Example: `88` for typical Meet bottom strip at 720p.
   */
  meetRecordingCropBottomPx: Math.max(
    0,
    Number(process.env.MEET_RECORDING_CROP_BOTTOM_PX ?? "0")
  ),
  /**
   * Public origin used for Google OAuth redirect URI and for cookie scoping. Must match the
   * "Authorized redirect URI" you register in Google Cloud Console exactly (scheme + host + port).
   * Example: `http://localhost:3000` in dev, `https://meet-bot.example.com` in prod.
   */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    ""
  ),
  /**
   * Google OAuth client. Both id and secret are issued together in Google Cloud Console
   * → "APIs & Services" → "Credentials" → "OAuth client ID" (Application type: Web application).
   * Empty client id disables the auth + dashboard features (anonymous /bots still works).
   */
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  /**
   * Cookie/HMAC secret for signed session cookies (`@fastify/cookie`). 32+ random bytes recommended.
   * Generate with: `openssl rand -hex 32`. Restarting the server with a new value invalidates sessions.
   */
  sessionSecret: process.env.SESSION_SECRET?.trim() || "",
  /**
   * AES-256-GCM key (32 bytes, base64-encoded) for at-rest encryption of Google refresh tokens stored
   * in Redis. Generate with: `openssl rand -base64 32`. Rotating it logs every user out (refresh fails).
   */
  tokenEncKey: process.env.TOKEN_ENC_KEY?.trim() || "",
  /**
   * App-layer encryption key for PII/tokens stored in MySQL. 32-byte base64.
   * Keep it separate from TOKEN_ENC_KEY so refresh-token rotation and DB field rotation can be independent.
   */
  dataEncKey: process.env.DATA_ENC_KEY?.trim() || "",
  dataEncKeyVersion: process.env.DATA_ENC_KEY_VERSION?.trim() || "v1",
  /**
   * Root domain for session cookies (e.g. `.arshadli.me`). If unset, cookies are locked
   * to the exact subdomain that sets them (which breaks cross-subdomain dashboard logins).
   */
  cookieDomain: (() => {
    const raw = process.env.COOKIE_DOMAIN?.trim();
    if (raw) return raw;
    const origin = process.env.DASHBOARD_ORIGIN?.trim() || "";
    if (!origin || origin.includes("localhost") || origin.includes("127.0.0.1")) return undefined;
    try {
      const url = new URL(origin);
      const parts = url.hostname.split(".");
      // If hostname is "meet-bot-demo.arshadli.me", return ".arshadli.me"
      if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
    } catch { /* ignore */ }
    return undefined;
  })(),
  mysqlHost: process.env.DB_HOST?.trim() || process.env.MYSQL_HOST?.trim() || "127.0.0.1",
  mysqlPort: Number(process.env.DB_PORT ?? process.env.MYSQL_PORT ?? "3306"),
  mysqlUser: process.env.DB_USERNAME?.trim() || process.env.MYSQL_USER?.trim() || "root",
  mysqlPassword: process.env.DB_PASSWORD?.trim() || process.env.MYSQL_PASSWORD?.trim() || "",
  mysqlDatabase:
    process.env.DB_DATABASE?.trim() || process.env.MYSQL_DATABASE?.trim() || "meet_bot",
  mysqlSsl: process.env.MYSQL_SSL === "true",
  fcmProjectId: process.env.FCM_PROJECT_ID?.trim() || "",
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL?.trim() || "",
  fcmPrivateKey: (process.env.FCM_PRIVATE_KEY?.trim() || "").replace(/\\n/g, "\n"),
  nextPublicApiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:3000",
  nextPublicFirebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  nextPublicFirebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  nextPublicFirebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  nextPublicFirebaseMessagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  nextPublicFirebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
  nextPublicFirebaseVapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || "",
  /**
   * Protects legacy `/queue`, `/bots`, and unauthenticated bot creation when set.
   * Send as `Authorization: Bearer ...` or `X-API-Key`. Omit only on trusted localhost/dev.
   */
  internalApiKey: process.env.INTERNAL_API_KEY?.trim() || "",
  /**
   * When true, the API mocks a successful login and bypasses real OAuth requirements.
   * Useful for testing the recording flow without setting up Google Cloud / S3.
   */
  appDemoMode: process.env.APP_DEMO_MODE === "true",
};

export function isAuthConfigured(): boolean {
  if (config.appDemoMode) return true;
  return Boolean(
    config.googleClientId && config.googleClientSecret && config.sessionSecret && config.tokenEncKey
  );
}

export function recordingsRoot(): string {
  return join(config.dataDir, "recordings");
}
