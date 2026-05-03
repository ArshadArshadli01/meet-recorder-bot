import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Job } from "bullmq";
import { config } from "../config.js";
import { enrichJobResultFromDisk } from "../bot-api-enrich.js";
import { getTimesInMeet } from "../meet-metrics.js";
import { clearJobCancel, requestJobCancel } from "../job-cancel.js";
import { connection, meetQueue } from "../queue.js";
import {
  countUserBots,
  getJobOwner,
  listUserBotIds,
  recordUserBot,
} from "../auth/user-store.js";
import { requireUserId } from "./auth-routes.js";
import type { CreateBotBody, MeetJobPayload, MeetJobResult } from "../types.js";
import { sendUserNotification } from "../notifications/fcm.js";
import { userHasObjectStorageRow } from "../db/models/user-object-storage.js";
import { deleteUserBot } from "../db/models/user-bots.js";
import {
  getUserRecordFormDefaults,
  upsertUserRecordFormDefaults,
} from "../db/models/user-record-form-defaults.js";

/**
 * Per-user wrapper around the existing /bots endpoints. Difference vs the legacy /bots routes:
 *   - Cookie-authenticated; every job is tagged with user_id so /me/bots only shows mine.
 *   - Job payload carries save_to_drive / save_to_spaces flags (worker reads them after recording).
 *   - Job ownership is enforced on detail/cancel (no cross-tenant access via guessed UUIDs).
 */

async function jobSnapshot(
  job: Job,
  includeArtifacts: boolean,
  ownerId: string
): Promise<Record<string, unknown> | null> {
  const id = String(job.id);
  /** Defense in depth: bot listing already filters by user, but a directly-pinged ID must also match. */
  const owner = await getJobOwner(connection, id);
  if (owner && owner !== ownerId) return null;

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
    /** Align with worker: legacy anonymous jobs always mirror to Spaces when configured. */
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
    save_to_drive: data?.save_to_drive !== false,
    save_to_spaces: data?.save_to_spaces === true,
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

async function loadOwnedJob(
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  botId: string
): Promise<Job | null> {
  const job = await meetQueue.getJob(botId);
  if (!job) {
    reply.code(404);
    reply.send({ error: "bot_not_found" });
    return null;
  }
  const owner = await getJobOwner(connection, botId);
  if (owner && owner !== userId) {
    reply.code(404);
    reply.send({ error: "bot_not_found" });
    return null;
  }
  return job;
}

export async function registerMeBotRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      include_artifacts?: string;
    };
  }>("/me/bots", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    const includeArtifacts = req.query.include_artifacts === "1";

    /**
     * Orphan rows (job removed from BullMQ but still in `user_bots`) break
     * pagination ("1 / 7" with only one job). Drop stale rows when listing.
     */
    const ids = await listUserBotIds(connection, userId, limit, offset);
    const snapshots: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      const job = await meetQueue.getJob(id);
      if (!job) {
        await deleteUserBot(id);
        continue;
      }
      const snap = await jobSnapshot(job, includeArtifacts, userId);
      if (snap) snapshots.push(snap);
    }
    const total = await countUserBots(connection, userId);
    return {
      total,
      total_returned: snapshots.length,
      limit,
      offset,
      bots: snapshots,
    };
  });

  app.post<{ Body: CreateBotBody }>("/me/bots", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;

    const body = req.body;
    if (!body?.meeting_url || !body.meeting_url.startsWith("http")) {
      reply.code(400);
      return { error: "meeting_url must be an http(s) URL" };
    }

    const botName = (body.bot_name ?? "Meet Bot").slice(0, 80);
    const botId = randomUUID();
    /** Form explicit `false` göndərir; köhnə klientlər omit edəndə `!== false` → Drive açıq qalır. */
    let saveToDrive = body.save_to_drive !== false;
    let saveToSpaces = body.save_to_spaces === true;
    if (config.appDemoMode) {
      saveToDrive = false;
      saveToSpaces = false;
    }
    const driveFolderId = body.drive_folder_id?.trim() || undefined;

    const payload: MeetJobPayload = {
      meeting_url: body.meeting_url,
      bot_name: botName,
      user_id: userId,
      save_to_drive: saveToDrive,
      save_to_spaces: saveToSpaces,
      drive_folder_id: driveFolderId,
    };
    const now = Date.now();
    await meetQueue.add("record", payload, {
      jobId: botId,
      removeOnComplete: false,
      removeOnFail: false,
    });
    await recordUserBot(connection, userId, botId, now);
    void sendUserNotification({
      userId,
      kind: "queued",
      title: "Record növbəyə alındı",
      body: `${botName} növbədədir və qısa müddətdə başlayacaq.`,
      data: { botId, status: "queued" },
    });

    reply.code(202);
    void upsertUserRecordFormDefaults(userId, {
      meeting_url: body.meeting_url,
      bot_name: botName,
      save_to_drive: saveToDrive,
      save_to_spaces: saveToSpaces,
      drive_folder_id: driveFolderId ?? null,
    }).catch(() => {});

    return {
      bot_id: botId,
      status: "queued",
      save_to_drive: saveToDrive,
      save_to_spaces: saveToSpaces,
    };
  });

  app.get("/me/record-form-defaults", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const row = await getUserRecordFormDefaults(userId);
    return row ?? null;
  });

  app.put<{
    Body: {
      meeting_url?: string | null;
      bot_name?: string;
      save_to_drive?: boolean;
      save_to_spaces?: boolean;
      drive_folder_id?: string | null;
    };
  }>("/me/record-form-defaults", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const body = req.body ?? {};
    const botName = (body.bot_name ?? "Meet Bot").trim().slice(0, 80);
    let saveToDrive = body.save_to_drive !== false;
    let saveToSpaces = body.save_to_spaces === true;
    if (config.appDemoMode) {
      saveToDrive = false;
      saveToSpaces = false;
    }
    await upsertUserRecordFormDefaults(userId, {
      meeting_url: body.meeting_url ?? null,
      bot_name: botName,
      save_to_drive: saveToDrive,
      save_to_spaces: saveToSpaces,
      drive_folder_id: body.drive_folder_id?.trim() || null,
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/me/bots/:id", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const job = await loadOwnedJob(req, reply, userId, req.params.id);
    if (!job) return;
    return jobSnapshot(job, true, userId);
  });

  app.post<{ Params: { id: string } }>("/me/bots/:id/cancel", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const job = await loadOwnedJob(req, reply, userId, req.params.id);
    if (!job) return;

    const state = await job.getState();
    if (state === "completed") return { ok: true, status: "already_completed" };
    if (state === "failed") return { ok: true, status: "already_failed" };

    const notYetRunning = new Set(["waiting", "delayed", "paused", "prioritized"]);
    if (notYetRunning.has(state)) {
      try {
        await job.remove();
        await clearJobCancel(connection, req.params.id);
        return {
          ok: true,
          status: "removed_from_queue",
          previous_job_state: state,
        };
      } catch {
        await requestJobCancel(connection, req.params.id);
        reply.code(202);
        return {
          ok: true,
          status: "cancellation_requested",
          job_state: await job.getState(),
        };
      }
    }
    await requestJobCancel(connection, req.params.id);
    reply.code(202);
    return {
      ok: true,
      status: "cancellation_requested",
      job_state: state,
    };
  });

  app.delete<{ Params: { id: string } }>("/me/bots/:id", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const botId = req.params.id;
    const job = await loadOwnedJob(req, reply, userId, botId);
    if (!job) return;
    const state = await job.getState();
    if (state === "active") {
      await requestJobCancel(connection, botId);
      reply.code(202);
      return { ok: true, status: "cancellation_requested" };
    }
    await job.remove();
    await deleteUserBot(botId);
    await clearJobCancel(connection, botId).catch(() => {});
    try {
      await rm(join(config.dataDir, "recordings", botId), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: true, removed: true };
  });

  /** Bulk remove finished/failed jobs from queue + index + local recordings dir. Active jobs are skipped (cancel them first). */
  app.post<{ Body: { ids?: string[] } }>("/me/bots/bulk-delete", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const raw = req.body?.ids;
    const ids = Array.isArray(raw) ? raw.map((id) => String(id)).filter(Boolean).slice(0, 100) : [];
    if (ids.length === 0) {
      reply.code(400);
      return { error: "ids array required" };
    }
    let removed = 0;
    let skipped_active = 0;
    for (const botId of ids) {
      const owner = await getJobOwner(connection, botId);
      if (owner !== userId) continue;
      const job = await meetQueue.getJob(botId);
      if (!job) {
        await deleteUserBot(botId);
        try {
          await rm(join(config.dataDir, "recordings", botId), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        removed += 1;
        continue;
      }
      const state = await job.getState();
      if (state === "active") {
        skipped_active += 1;
        continue;
      }
      await job.remove();
      await deleteUserBot(botId);
      await clearJobCancel(connection, botId).catch(() => {});
      try {
        await rm(join(config.dataDir, "recordings", botId), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      removed += 1;
    }
    return { ok: true, removed, skipped_active };
  });

  /** Convenience: dashboard config fetch — operator Spaces and/or per-user bucket credentials. */
  app.get("/me/config", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const userStorage = await userHasObjectStorageRow(userId);
    return {
      spaces_enabled: Boolean(config.spaces) || userStorage,
      spaces_bucket: config.spaces?.bucket,
      user_object_storage: userStorage,
    };
  });
}
