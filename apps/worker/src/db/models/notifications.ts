import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "../mysql.js";

export type NotificationKind =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "system";

export type NotificationStatus = "sent" | "failed" | "info";

export type NotificationRow = {
  id: number;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  status: NotificationStatus;
  errorMessage: string | null;
  isRead: boolean;
  data: Record<string, unknown> | null;
  botId: string | null;
  createdAtMs: number;
};

type DbNotificationRow = RowDataPacket & {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  error_message: string | null;
  is_read: number;
  data_json: string | Record<string, unknown> | null;
  bot_id: string | null;
  created_at_ms: number | string;
};

function parseData(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function rowToRecord(row: DbNotificationRow): NotificationRow {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    kind: (row.kind as NotificationKind) || "system",
    title: row.title,
    body: row.body,
    status: (row.status as NotificationStatus) || "info",
    errorMessage: row.error_message,
    isRead: Boolean(row.is_read),
    data: parseData(row.data_json),
    botId: row.bot_id,
    createdAtMs: Number(row.created_at_ms),
  };
}

export async function createNotification(input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  status?: NotificationStatus;
  errorMessage?: string;
  data?: Record<string, unknown>;
  botId?: string | null;
}): Promise<number> {
  const status: NotificationStatus = input.status ?? "info";
  const dataJson = input.data ? JSON.stringify(input.data) : null;
  const [res] = await db().query<ResultSetHeader>(
    `INSERT INTO user_notifications (
       user_id, kind, title, body, status, error_message, is_read, data_json, bot_id, created_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      input.userId,
      input.kind,
      input.title.slice(0, 191),
      input.body.slice(0, 1024),
      status,
      input.errorMessage ? input.errorMessage.slice(0, 900) : null,
      dataJson,
      input.botId ?? null,
      Date.now(),
    ]
  );
  return res.insertId;
}

export async function listNotifications(input: {
  userId: string;
  limit: number;
  offset: number;
  unreadOnly: boolean;
}): Promise<{ items: NotificationRow[]; total: number; unread: number }> {
  const limit = Math.min(200, Math.max(1, input.limit));
  const offset = Math.max(0, input.offset);
  const where = input.unreadOnly
    ? "WHERE user_id = ? AND is_read = 0"
    : "WHERE user_id = ?";
  const [rows] = await db().query<DbNotificationRow[]>(
    `SELECT id, user_id, kind, title, body, status, error_message, is_read, data_json, bot_id, created_at_ms
     FROM user_notifications ${where}
     ORDER BY created_at_ms DESC, id DESC
     LIMIT ? OFFSET ?`,
    [input.userId, limit, offset]
  );

  const [totalRows] = await db().query<Array<RowDataPacket & { c: number }>>(
    "SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ?",
    [input.userId]
  );
  const [unreadRows] = await db().query<Array<RowDataPacket & { c: number }>>(
    "SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ? AND is_read = 0",
    [input.userId]
  );

  return {
    items: rows.map(rowToRecord),
    total: Number(totalRows[0]?.c ?? 0),
    unread: Number(unreadRows[0]?.c ?? 0),
  };
}

export async function unreadCount(userId: string): Promise<number> {
  const [rows] = await db().query<Array<RowDataPacket & { c: number }>>(
    "SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

export async function markRead(userId: string, id: number): Promise<boolean> {
  const [res] = await db().query<ResultSetHeader>(
    "UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
    [id, userId]
  );
  return res.affectedRows > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const [res] = await db().query<ResultSetHeader>(
    "UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  return res.affectedRows;
}

export async function deleteNotification(userId: string, id: number): Promise<boolean> {
  const [res] = await db().query<ResultSetHeader>(
    "DELETE FROM user_notifications WHERE id = ? AND user_id = ?",
    [id, userId]
  );
  return res.affectedRows > 0;
}
