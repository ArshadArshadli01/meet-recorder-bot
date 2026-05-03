import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "../mysql.js";
import { decryptData, encryptData } from "../../security/data-crypto.js";

type PushTokenRow = RowDataPacket & {
  id: number;
  token_enc: string;
};

export async function upsertPushToken(
  userId: string,
  token: string,
  userAgent: string | null
): Promise<void> {
  const now = Date.now();
  const tokenEnc = encryptData(token);
  await db().query<ResultSetHeader>(
    `INSERT INTO user_push_tokens (user_id, token_enc, user_agent, created_at_ms, last_seen_ms)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_ms = VALUES(last_seen_ms), user_agent = VALUES(user_agent)`,
    [userId, tokenEnc, userAgent, now, now]
  );
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  const [rows] = await db().query<PushTokenRow[]>(
    "SELECT id, token_enc FROM user_push_tokens WHERE user_id = ?",
    [userId]
  );
  for (const row of rows) {
    try {
      if (decryptData(row.token_enc) === token) {
        await db().query("DELETE FROM user_push_tokens WHERE id = ?", [row.id]);
      }
    } catch {
      // Ignore undecryptable rows from previous keys; they can be garbage-collected later.
    }
  }
}

export async function listPushTokens(userId: string): Promise<string[]> {
  const [rows] = await db().query<PushTokenRow[]>(
    "SELECT id, token_enc FROM user_push_tokens WHERE user_id = ?",
    [userId]
  );
  const out: string[] = [];
  for (const row of rows) {
    try {
      out.push(decryptData(row.token_enc));
    } catch {
      // Skip invalid rows; we don't break delivery for one corrupted token.
    }
  }
  return out;
}
