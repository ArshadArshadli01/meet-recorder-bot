import type { Redis } from "ioredis";
import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * One-shot migration of legacy Redis-only data into MySQL. Runs after the
 * SQL migrations during boot. Idempotent: every step checks whether the key
 * still exists, copies the data, and only then deletes the Redis key. We
 * also record a marker row in `schema_migrations` so subsequent boots skip
 * the work entirely.
 */

const MARKER = "redis-backfill-2026-04-30";

type MarkerRow = RowDataPacket & { name: string };

async function alreadyDone(pool: Pool): Promise<boolean> {
  const [rows] = await pool.query<MarkerRow[]>(
    "SELECT name FROM schema_migrations WHERE name = ? LIMIT 1",
    [MARKER]
  );
  return rows.length > 0;
}

async function recordMarker(pool: Pool): Promise<void> {
  await pool.query(
    "INSERT IGNORE INTO schema_migrations (name, applied_at_ms) VALUES (?, ?)",
    [MARKER, Date.now()]
  );
}

async function backfillUserBots(pool: Pool, redis: Redis): Promise<number> {
  let cursor = "0";
  let moved = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "meet-bot:user:*:bots",
      "COUNT",
      100
    );
    cursor = next;
    for (const key of keys) {
      const userId = key.replace(/^meet-bot:user:/, "").replace(/:bots$/, "");
      if (!userId) continue;
      /** zrange WITHSCORES: ['jobId', 'score', 'jobId', 'score', ...] */
      const entries = await redis.zrange(key, 0, -1, "WITHSCORES");
      for (let i = 0; i < entries.length; i += 2) {
        const jobId = entries[i];
        const scoreStr = entries[i + 1] ?? "0";
        if (!jobId) continue;
        const createdAtMs = Number(scoreStr) || Date.now();
        await pool.query(
          `INSERT INTO user_bots (job_id, user_id, created_at_ms)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             user_id = VALUES(user_id),
             created_at_ms = VALUES(created_at_ms)`,
          [jobId, userId, createdAtMs]
        );
        moved += 1;
      }
      await redis.del(key);
    }
  } while (cursor !== "0");
  return moved;
}

async function backfillJobOwners(pool: Pool, redis: Redis): Promise<number> {
  let cursor = "0";
  let moved = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "meet-bot:job:*:owner",
      "COUNT",
      200
    );
    cursor = next;
    for (const key of keys) {
      const jobId = key.replace(/^meet-bot:job:/, "").replace(/:owner$/, "");
      if (!jobId) continue;
      const userId = await redis.get(key);
      if (userId) {
        await pool.query(
          `INSERT INTO user_bots (job_id, user_id, created_at_ms)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
          [jobId, userId, Date.now()]
        );
        moved += 1;
      }
      await redis.del(key);
    }
  } while (cursor !== "0");
  return moved;
}

async function dropLegacyUserHashes(redis: Redis): Promise<number> {
  let cursor = "0";
  let dropped = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "meet-bot:user:*",
      "COUNT",
      200
    );
    cursor = next;
    /** `meet-bot:user:<id>` only ever held lastLoginMs (also in users_secure). */
    const obsolete = keys.filter((k) => /^meet-bot:user:[^:]+$/.test(k));
    if (obsolete.length > 0) {
      await redis.del(...obsolete);
      dropped += obsolete.length;
    }
  } while (cursor !== "0");
  return dropped;
}

async function dropLegacySessions(redis: Redis): Promise<number> {
  let cursor = "0";
  let dropped = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "meet-bot:session:*",
      "COUNT",
      200
    );
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
      dropped += keys.length;
    }
  } while (cursor !== "0");
  return dropped;
}

export async function runRedisBackfill(input: {
  pool: Pool;
  redis: Redis;
  log?: (msg: string) => void;
}): Promise<void> {
  if (await alreadyDone(input.pool)) return;
  const log = input.log ?? (() => {});
  try {
    const userBots = await backfillUserBots(input.pool, input.redis);
    const owners = await backfillJobOwners(input.pool, input.redis);
    const userHashes = await dropLegacyUserHashes(input.redis);
    const sessions = await dropLegacySessions(input.redis);
    await recordMarker(input.pool);
    log(
      `[redis-backfill] user_bots=${userBots} job_owners=${owners} user_hashes=${userHashes} sessions=${sessions}`
    );
  } catch (err) {
    log(`[redis-backfill] failed: ${(err as Error).message ?? err}`);
  }
}
