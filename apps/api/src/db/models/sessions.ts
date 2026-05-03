import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../mysql.js";

/**
 * Session model — replaces the previous Redis-backed sessions. Sliding TTL is
 * implemented by bumping `expires_at_ms` on every read of a still-valid row.
 * A row stays in MySQL until either `destroySession()` removes it or
 * `cleanupExpiredSessions()` (called on a 1h interval at API boot) sweeps it.
 */

export const SESSION_COOKIE = "mb_sid";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_TTL_FOR_COOKIE_SECONDS = SESSION_TTL_SECONDS;

export type SessionRecord = {
  userId: string;
  createdAtMs: number;
};

type SessionRow = RowDataPacket & {
  id: string;
  user_id: string;
  created_at_ms: number;
  expires_at_ms: number;
};

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<string> {
  const sid = newSessionId();
  const now = Date.now();
  const expires = now + SESSION_TTL_SECONDS * 1000;
  await db().query(
    "INSERT INTO sessions (id, user_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)",
    [sid, userId, now, expires]
  );
  return sid;
}

export async function readSession(sid: string): Promise<SessionRecord | null> {
  const [rows] = await db().query<SessionRow[]>(
    "SELECT id, user_id, created_at_ms, expires_at_ms FROM sessions WHERE id = ? LIMIT 1",
    [sid]
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.expires_at_ms) <= Date.now()) {
    /** Stale row that escaped the cleanup sweep — drop it now and treat as logged out. */
    await db().query("DELETE FROM sessions WHERE id = ?", [sid]).catch(() => {});
    return null;
  }
  /** Slide the TTL forward so an active user is not logged out mid-week. */
  const newExpires = Date.now() + SESSION_TTL_SECONDS * 1000;
  await db()
    .query("UPDATE sessions SET expires_at_ms = ? WHERE id = ?", [newExpires, sid])
    .catch(() => {});
  return {
    userId: String(row.user_id),
    createdAtMs: Number(row.created_at_ms),
  };
}

export async function destroySession(sid: string): Promise<void> {
  await db().query("DELETE FROM sessions WHERE id = ?", [sid]);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const [res] = await db().query(
    "DELETE FROM sessions WHERE expires_at_ms <= ?",
    [Date.now()]
  );
  return (res as { affectedRows?: number }).affectedRows ?? 0;
}
