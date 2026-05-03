import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "bullmq";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { buildInfoLogLine, getBuildInfo } from "./build-info.js";
import { config, isAuthConfigured } from "./config.js";
import { clearJobCancel, requestJobCancel } from "./job-cancel.js";
import { getTimesInMeet } from "./meet-metrics.js";
import { enrichJobResultFromDisk } from "./bot-api-enrich.js";
import { closeQueue, connection, meetQueue } from "./queue.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerMeBotRoutes } from "./routes/me-bots-routes.js";
import { registerNotificationRoutes } from "./routes/notifications-routes.js";
import { registerStorageRoutes } from "./routes/storage-routes.js";
import { setupRealtime } from "./realtime-server.js";
import { internalApiKeyValid, requireInternalApiKey } from "./auth/internal-api-key.js";
import { registerAuthGuard } from "./auth/require-auth-hook.js";
import { SESSION_COOKIE, readSession } from "./auth/session.js";
import { getJobOwner, recordUserBot } from "./auth/user-store.js";
import type { CreateBotBody, MeetJobPayload, MeetJobResult } from "./types.js";
import { runMigrations } from "./db/migrate.js";
import { cleanupExpiredSessions } from "./db/models/sessions.js";
import { db } from "./db/mysql.js";
import { runRedisBackfill } from "./db/redis-backfill.js";
import { sendUserNotification } from "./notifications/fcm.js";
import { sweepDueLocalRecordingPurges } from "./local-recording-purge.js";

process.stdout.write(`${buildInfoLogLine("api")}\n`);

const app = Fastify({ logger: true, trustProxy: true });

/** Qonaqlar ötrü anonim keçid bağlanır — yalnız sessiya ilə iş sahibi yükləyə bilər. İstəsəniz INTERNAL_API_KEY ilə operator girişi. */
async function assertRecordingOwnerAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  botId: string
): Promise<boolean> {
  if (config.appDemoMode) return true;
  if (config.internalApiKey && internalApiKeyValid(request)) {
    return true;
  }
  const sidCookie = request.unsignCookie(request.cookies[SESSION_COOKIE] ?? "");
  const session =
    sidCookie.valid && sidCookie.value ? await readSession(sidCookie.value) : null;
  const sessionUserId = session?.userId;
  if (!sessionUserId) {
    reply.code(401);
    reply.send({ error: "authentication_required" });
    return false;
  }
  const job = await meetQueue.getJob(botId);
  const payloadUid = (job?.data as MeetJobPayload | undefined)?.user_id;
  const ownerFromDb = await getJobOwner(connection, botId);
  const owner = payloadUid ?? ownerFromDb;
  if (!owner || owner !== sessionUserId) {
    reply.code(403);
    reply.send({ error: "forbidden" });
    return false;
  }
  return true;
}

/** `GET /recordings/:botId/artifacts/...` — serve files from `{DATA_DIR}/recordings/{botId}/…` (same tree the worker writes). */
function contentTypeForArtifact(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jsonl") return "application/x-ndjson; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

function safeRecordingDownloadPath(botId: string, wildcardSuffix: string): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(botId)) return null;
  const root = resolve(join(config.dataDir, "recordings", botId));
  const segments = wildcardSuffix.split("/").filter((s) => s !== "" && s !== "." && s !== "..");
  const abs = resolve(root, ...segments);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.split(/[/\\]/).includes("..")) return null;
  return abs;
}

/** Basename of the worker's primary recording file (`relativePath`), if any. */
function primaryRecordingBasename(rv: MeetJobResult): string | null {
  const rp = rv.relativePath?.replace(/\\/g, "/");
  if (!rp) return null;
  const parts = rp.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/**
 * True when this HTTP path targets the main video file (same file `spaces_url` / Drive refer to),
 * not artifacts/chat.
 */
function shouldRedirectPrimaryRecordingToCloud(rv: MeetJobResult, wildcardSuffix: string): boolean {
  const norm = wildcardSuffix.replace(/\\/g, "/");
  const reqSegments = norm.split("/").filter(Boolean);
  const reqTail = reqSegments[reqSegments.length - 1];
  if (!reqTail) return false;

  const primary = primaryRecordingBasename(rv);
  if (primary) return primary === reqTail;

  /** Legacy / edge: cloud URL set but `relativePath` missing — single-segment video at repo root. */
  if (reqSegments.length !== 1) return false;
  if (!/\.(mp4|webm)$/i.test(reqTail)) return false;
  return !!(
    rv.spaces_url ||
    rv.drive_file_id ||
    (rv.drive_url && rv.drive_url.includes("/file/d/"))
  );
}

/** Priority: Google Drive → Spaces (S3-compatible). Same order as dashboard `primaryVideoOpen`. */
function redirectPrimaryRecordingIfCloud(
  reply: { redirect: (url: string, statusCode?: number) => unknown },
  rv: MeetJobResult
): boolean {
  if (rv.drive_file_id) {
    reply.redirect(`https://drive.google.com/file/d/${rv.drive_file_id}/view`, 302);
    return true;
  }
  if (rv.drive_url?.includes("/file/d/")) {
    reply.redirect(rv.drive_url, 302);
    return true;
  }
  if (rv.spaces_url) {
    reply.redirect(rv.spaces_url, 302);
    return true;
  }
  return false;
}

app.get("/health", async () => ({ ok: true }));

/**
 * Returns the build stamp written into the image at `docker build` time. Use this to confirm the
 * running container is the one you just rebuilt — the same string is also logged at boot.
 */
app.get("/version", async () => getBuildInfo());

app.get("/recordings/:botId/*", async (request, reply) => {
  const botId = (request.params as { botId: string })["botId"];
  const star = (request.params as Record<string, string>)["*"];
  if (!star) {
    reply.code(404);
    return { error: "use /recordings/:botId/artifacts/…" };
  }

  if (!(await assertRecordingOwnerAccess(request, reply, botId))) return;

  const job = await meetQueue.getJob(botId);
  if (job) {
    const state = await job.getState();
    if (state === "completed") {
      const rv = job.returnvalue as MeetJobResult | null;
      if (
        rv &&
        shouldRedirectPrimaryRecordingToCloud(rv, star) &&
        redirectPrimaryRecordingIfCloud(reply, rv)
      ) {
        return;
      }
    }
  }

  const abs = safeRecordingDownloadPath(botId, star);
  if (!abs) {
    reply.code(404);
    return { error: "not found" };
  }
  try {
    const st = statSync(abs);
    if (!st.isFile()) {
      reply.code(404);
      return { error: "not a file" };
    }
  } catch {
    reply.code(404);
    return { error: "not found" };
  }
  reply.header("Content-Type", contentTypeForArtifact(abs));
  return reply.send(createReadStream(abs));
});

/** Queue depth — if `waiting` grows and never drops, the worker is not connected to this Redis/queue. */
app.get("/queue", async (request, reply) => {
  if (!requireInternalApiKey(request, reply)) return;
  let redisPing = false;
  try {
    redisPing = (await connection.ping()) === "PONG";
  } catch {
    redisPing = false;
  }
  const counts = await meetQueue.getJobCounts();
  return {
    queue_name: config.queueName,
    redis_ping: redisPing ? "PONG" : "FAIL",
    jobs: counts,
  };
});

/** Obliterate queue + `meet-bot:*` Redis keys (cancel flags, times-in-meet markers). */
app.post("/queue/clear", async (request, reply) => {
  if (!requireInternalApiKey(request, reply)) return;
  const keys = await connection.keys("meet-bot:*");
  if (keys.length > 0) {
    await connection.del(...keys);
  }
  await meetQueue.obliterate({ force: true });
  return {
    ok: true,
    queue_name: config.queueName,
    redis_keys_removed: keys.length,
  };
});

/** List bots (BullMQ jobs). `times_in_meet` is 1 once the bot reaches lobby/in-call/recording for that attempt. */
app.get<{
  Querystring: { limit?: string; include_artifacts?: string };
}>("/bots", async (request, reply) => {
  if (!requireInternalApiKey(request, reply)) return;
  const limit = Math.min(500, Math.max(1, Number(request.query.limit ?? 100)));
  const includeArtifacts = request.query.include_artifacts === "1";
  const types = [
    "waiting",
    "delayed",
    "paused",
    "prioritized",
    "active",
    "completed",
    "failed",
  ] as const;
  const jobs = await meetQueue.getJobs([...types], 0, limit - 1, false);
  const counts = await meetQueue.getJobCounts();
  const bots = await Promise.all(
    jobs.map((j) => botSnapshot(j, includeArtifacts))
  );
  return {
    queue_name: config.queueName,
    counts,
    total_returned: bots.length,
    limit,
    bots,
  };
});

app.post<{ Body: CreateBotBody }>("/bots", async (request, reply) => {
  const body = request.body;
  if (!body?.meeting_url?.startsWith("http")) {
    reply.code(400);
    return { error: "meeting_url must be an http(s) URL" };
  }

  const botName = (body.bot_name ?? "Meet Bot").slice(0, 80);
  const botId = randomUUID();
  const saveToDrive = body.save_to_drive !== false;
  const driveFolderId = body.drive_folder_id?.trim() || undefined;

  // Legacy /bots now preserves login context when available so Drive upload can still work.
  const sidCookie = request.unsignCookie(request.cookies[SESSION_COOKIE] ?? "");
  const session =
    sidCookie.valid && sidCookie.value ? await readSession(sidCookie.value) : null;
  const userId = session?.userId;

  if (config.internalApiKey && !userId && !internalApiKeyValid(request)) {
    reply.code(401);
    return {
      error: "unauthorized",
      message:
        "Anonymous legacy POST /bots requires INTERNAL_API_KEY (Authorization: Bearer or X-API-Key), or sign in and use POST /me/bots.",
    };
  }

  const saveToSpaces = userId
    ? body.save_to_spaces === true
    : body.save_to_spaces ?? Boolean(config.spaces);

  if (saveToDrive && !userId) {
    reply.code(401);
    return {
      error: "drive_upload_requires_login",
      message:
        "Drive upload needs an authenticated user session. Sign in and use /me/bots (or call /bots with session cookies).",
    };
  }

  const payload: MeetJobPayload = {
    meeting_url: body.meeting_url,
    bot_name: botName,
    ...(userId ? { user_id: userId, save_to_drive: saveToDrive, save_to_spaces: saveToSpaces } : {}),
    ...(!userId ? { save_to_spaces: saveToSpaces } : {}),
    ...(driveFolderId ? { drive_folder_id: driveFolderId } : {}),
  };

  await meetQueue.add(
    "record",
    payload,
    { jobId: botId, removeOnComplete: false, removeOnFail: false }
  );
  if (userId) {
    await recordUserBot(connection, userId, botId, Date.now());
    void sendUserNotification({
      userId,
      kind: "queued",
      title: "Record növbəyə alındı",
      body: `${botName} növbədədir və qısa müddətdə başlayacaq.`,
      data: { botId, status: "queued" },
    });
  }

  reply.code(202);
  return {
    bot_id: botId,
    status: "queued",
    save_to_drive: userId ? saveToDrive : false,
    save_to_spaces: saveToSpaces,
    user_id: userId,
  };
});

app.get<{ Params: { id: string } }>("/bots/:id", async (request, reply) => {
  if (!(await assertRecordingOwnerAccess(request, reply, request.params.id))) return;

  const job = await meetQueue.getJob(request.params.id);
  if (!job) {
    reply.code(404);
    return { error: "bot not found" };
  }

  return botSnapshot(job, true);
});

app.get<{ Params: { id: string } }>("/bots/:id/recording", async (request, reply) => {
  const botId = request.params.id;
  if (!(await assertRecordingOwnerAccess(request, reply, botId))) return;

  const job = await meetQueue.getJob(botId);
  if (!job) {
    reply.code(404);
    return { error: "bot not found" };
  }

  const state = await job.getState();
  if (state !== "completed") {
    reply.code(409);
    return { error: "recording not ready", status: state };
  }

  const rv = job.returnvalue as MeetJobResult | null;
  const rel = rv?.relativePath;
  if (rv && redirectPrimaryRecordingIfCloud(reply, rv)) {
    return;
  }
  if (!rel) {
    reply.code(500);
    return { error: "missing recording path" };
  }

  const abs = join(config.dataDir, rel);
  try {
    await access(abs);
  } catch {
    reply.code(404);
    return { error: "file missing on disk" };
  }

  const lower = rel.toLowerCase();
  const contentType = lower.endsWith(".mp4")
    ? "video/mp4"
    : lower.endsWith(".webm")
      ? "video/webm"
      : "application/octet-stream";
  reply.header("Content-Type", contentType);
  return reply.send(createReadStream(abs));
});

/** Cancel: queue jobs are removed immediately; active jobs get a Redis flag so the worker stops at the next loop tick. */
app.post<{ Params: { id: string } }>("/bots/:id/cancel", async (request, reply) => {
  if (!(await assertRecordingOwnerAccess(request, reply, request.params.id))) return;

  const job = await meetQueue.getJob(request.params.id);
  if (!job) {
    reply.code(404);
    return { error: "bot not found" };
  }

  const state = await job.getState();
  if (state === "completed") {
    return { ok: true, status: "already_completed" };
  }
  if (state === "failed") {
    return { ok: true, status: "already_failed" };
  }

  /** Waiting/delayed jobs never run `isCancelled` — only setting Redis would leave them stuck until a worker starts. */
  const notYetRunning = new Set(["waiting", "delayed", "paused", "prioritized"]);
  if (notYetRunning.has(state)) {
    try {
      await job.remove();
      await clearJobCancel(connection, request.params.id);
      reply.code(200);
      return {
        ok: true,
        status: "removed_from_queue",
        previous_job_state: state,
        message:
          "Job had not started yet; it was removed from the queue and will disappear from GET /bots (GET /bots/:id returns 404).",
      };
    } catch {
      await requestJobCancel(connection, request.params.id);
      reply.code(202);
      return {
        ok: true,
        status: "cancellation_requested",
        job_state: await job.getState(),
        message:
          "Could not remove the job (it may have just started); cancel flag set — worker will stop at next check.",
      };
    }
  }

  await requestJobCancel(connection, request.params.id);
  reply.code(202);
  return {
    ok: true,
    status: "cancellation_requested",
    job_state: state,
    message:
      state === "active"
        ? "Worker closes the browser at the next cancel check (typically within a few seconds while joining or recording). Then the job completes or fails with Recording cancelled."
        : "Cancel flag stored; worker will exit shortly.",
  };
});

app.delete<{ Params: { id: string } }>("/bots/:id", async (request, reply) => {
  if (!(await assertRecordingOwnerAccess(request, reply, request.params.id))) return;

  const job = await meetQueue.getJob(request.params.id);
  if (!job) {
    reply.code(404);
    return { error: "bot not found" };
  }

  const state = await job.getState();
  if (state === "active") {
    await requestJobCancel(connection, request.params.id);
    reply.code(202);
    return {
      ok: true,
      status: "cancellation_requested",
      message: "Same as POST /bots/:id/cancel — job stops shortly; use GET /bots/:id to watch state.",
    };
  }

  await job.remove();
  return { ok: true, removed: true };
});

async function botSnapshot(
  job: Job,
  includeArtifacts: boolean
): Promise<Record<string, unknown>> {
  const id = String(job.id);
  const state = await job.getState();
  const raw = job.progress;
  const po =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as { step?: string; times_in_meet?: number })
      : {};
  const redisTimes = await getTimesInMeet(connection, id);
  const times_in_meet = Math.max(Number(po.times_in_meet ?? 0), redisTimes);
  const data = job.data as MeetJobPayload;

  let result: MeetJobResult | null = (job.returnvalue as MeetJobResult) ?? null;
  if (includeArtifacts && result) {
    const allowInferPrimaryVideoSpaces =
      !data?.user_id || data.save_to_spaces === true;
    result = await enrichJobResultFromDisk(id, state, result, {
      allowInferPrimaryVideoSpaces,
    });
  }

  return {
    bot_id: id,
    status: state,
    meeting_url: data?.meeting_url,
    bot_name: data?.bot_name,
    progress_step: po.step ?? null,
    times_in_meet,
    processing_attempts: job.attemptsMade,
    attempts_limit: job.opts.attempts ?? undefined,
    result,
    failed_reason: job.failedReason ?? null,
    queued_at_ms: job.timestamp,
    processed_on_ms: job.processedOn ?? null,
    finished_on_ms: job.finishedOn ?? null,
  };
}

/**
 * Resolves where the built React SPA lives. In Docker the dist/ tree sits next to dist/server.js
 * at /app/web-dist. Locally we walk up to <repo>/apps/dashboard/dist (if present). When the folder
 * doesn't exist the SPA route silently no-ops so /bots and /version still work.
 */
function findSpaDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    "/app/web-dist",
    resolve(here, "..", "web-dist"),
    resolve(here, "..", "..", "..", "apps", "dashboard", "dist"),
    resolve(process.cwd(), "apps", "dashboard", "dist"),
    resolve(process.cwd(), "web", "dist"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function registerPlugins(): Promise<void> {
  /**
   * Cookie plugin must be registered before any route reads `req.cookies` / calls `setCookie`.
   * The signing secret is shared by /auth/google/start (state cookie) and the session cookie;
   * an unset secret means signed cookies always reject — fall back to a per-process random key
   * in dev mode so the cookie endpoints at least respond, while production must set SESSION_SECRET.
   */
  const secret = config.sessionSecret || "dev-only-not-for-production";
  await app.register(fastifyCookie, { secret });
  await app.register(fastifyCors, {
    origin: [config.dashboardOrigin, config.publicBaseUrl],
    credentials: true,
  });

  /** Global auth guard — rejects unauthenticated requests to all routes except /health, /version, /auth/*. */
  registerAuthGuard(app);
  const migrationResult = await runMigrations();
  if (migrationResult.appliedNow.length > 0) {
    app.log.info(
      `[server] applied ${migrationResult.appliedNow.length} migrations: ${migrationResult.appliedNow.join(", ")}`
    );
  }
  await runRedisBackfill({
    pool: db(),
    redis: connection,
    log: (msg) => app.log.info(msg),
  });

  if (isAuthConfigured()) {
    await registerAuthRoutes(app);
    await registerMeBotRoutes(app);
    await registerStorageRoutes(app);
    await registerNotificationRoutes(app);
    if (config.appDemoMode) {
      app.log.warn("[server] APP_DEMO_MODE is ACTIVE — mocking successful login");
    }
    app.log.info("[server] Google OAuth + /me/bots routes enabled");
  } else {
    /** Auth-aware no-op so the SPA can still call /auth/status to learn the server cannot log in. */
    await registerAuthRoutes(app);
    app.log.warn(
      "[server] Auth NOT configured — set GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET, TOKEN_ENC_KEY to enable login + dashboard"
    );
  }

  const spaDir = findSpaDir();
  if (spaDir) {
    await app.register(fastifyStatic, {
      root: spaDir,
      prefix: "/",
      /** Keep the default `decorateReply: true` so `reply.sendFile(...)` is available below — the
       * SPA-fallback handler relies on it. With it disabled, every React-router path (/login,
       * /dashboard, /bots/<id>) crashes with `reply.sendFile is not a function`. */
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url ?? "/";
      const isApiPath =
        url.startsWith("/auth") ||
        url.startsWith("/me") ||
        url.startsWith("/bots") ||
        url.startsWith("/queue") ||
        url.startsWith("/recordings") ||
        url.startsWith("/health") ||
        url.startsWith("/version");
      if (isApiPath) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.sendFile("index.html", spaDir);
    });
    app.log.info(`[server] serving SPA from ${spaDir}`);
  } else {
    app.log.warn("[server] no SPA build found (apps/dashboard/dist missing) — only API endpoints are available");
  }
}

async function main() {
  await registerPlugins();
  await setupRealtime(app);
  if (process.env.NODE_ENV === "production" && !config.internalApiKey) {
    app.log.warn(
      "[security] INTERNAL_API_KEY is unset — legacy /queue, GET /bots, and anonymous POST /bots are not protected by a shared secret (use POST /me/bots after login, or set INTERNAL_API_KEY)"
    );
  } else if (config.internalApiKey) {
    app.log.info("[security] INTERNAL_API_KEY is set — legacy admin routes and anonymous bot creation require the key or an authenticated session");
  }
  await app.listen({ port: config.port, host: "0.0.0.0" });

  /**
   * Sweep expired sessions hourly (the model also lazily drops stale rows on
   * read). Without this, the table grows unbounded as users sign in and never
   * explicitly log out.
   */
  const sessionSweepHandle = setInterval(
    () => {
      void cleanupExpiredSessions().catch((err) => {
        app.log.warn({ err }, "session_cleanup_failed");
      });
    },
    60 * 60 * 1000
  );
  /** Don't keep the event loop alive purely for this timer. */
  if (typeof sessionSweepHandle.unref === "function") sessionSweepHandle.unref();

  const localPurgeHandle = setInterval(() => {
    void sweepDueLocalRecordingPurges(connection, config.dataDir, (msg) =>
      app.log.info(msg)
    );
  }, 60 * 1000);
  if (typeof localPurgeHandle.unref === "function") localPurgeHandle.unref();

  const shutdown = async () => {
    clearInterval(sessionSweepHandle);
    clearInterval(localPurgeHandle);
    await app.close();
    await closeQueue();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
