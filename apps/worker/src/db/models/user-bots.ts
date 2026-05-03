import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "../mysql.js";

/**
 * `user_bots` is the per-user job index. Replaces the previous Redis sorted
 * set + JOB_OWNER_KEY pair: one row per (user, bot) is enough since the bot
 * lifecycle data lives in BullMQ. We sort by `created_at_ms DESC` to mirror
 * the old "newest first" zrevrange behaviour.
 */

type UserBotRow = RowDataPacket & {
  job_id: string;
  user_id: string;
  created_at_ms: number;
};

export async function recordUserBot(
  userId: string,
  jobId: string,
  createdAtMs: number
): Promise<void> {
  await db().query<ResultSetHeader>(
    `INSERT INTO user_bots (job_id, user_id, created_at_ms)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       created_at_ms = VALUES(created_at_ms)`,
    [jobId, userId, createdAtMs]
  );
}

export async function listUserBotIds(
  userId: string,
  limit: number,
  offset = 0
): Promise<string[]> {
  const safeLimit = Math.min(500, Math.max(1, limit));
  const safeOffset = Math.max(0, offset);
  const [rows] = await db().query<UserBotRow[]>(
    `SELECT job_id FROM user_bots
     WHERE user_id = ?
     ORDER BY created_at_ms DESC, job_id DESC
     LIMIT ? OFFSET ?`,
    [userId, safeLimit, safeOffset]
  );
  return rows.map((r) => String(r.job_id));
}

/**
 * Total count of jobs owned by this user. Cheap because `user_bots` has
 * `(user_id, created_at_ms)` indexed and the row count is small per user.
 * Used to drive the dashboard's "Daha Çox Göstər" button so we can hide
 * it once everything has been loaded.
 */
export async function countUserBots(userId: string): Promise<number> {
  const [rows] = await db().query<Array<RowDataPacket & { c: number }>>(
    "SELECT COUNT(*) AS c FROM user_bots WHERE user_id = ?",
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

export async function getJobOwner(jobId: string): Promise<string | null> {
  const [rows] = await db().query<UserBotRow[]>(
    "SELECT user_id FROM user_bots WHERE job_id = ? LIMIT 1",
    [jobId]
  );
  return rows[0] ? String(rows[0].user_id) : null;
}

export async function deleteUserBot(jobId: string): Promise<void> {
  await db().query("DELETE FROM user_bots WHERE job_id = ?", [jobId]);
}
