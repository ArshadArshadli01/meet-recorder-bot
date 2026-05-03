import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      ssl: config.mysqlSsl ? {} : undefined,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}

/**
 * Legacy DB row type kept here so models can import a single canonical shape.
 * (Schema is owned by `src/db/migrations/*.sql`; do not create tables here.)
 */
export type DbUserRow = RowDataPacket & {
  id: string;
  email_enc: string;
  name_enc: string | null;
  picture_enc: string | null;
  refresh_token_enc: string | null;
  /** Public S3 URL for the self-hosted avatar (added in 007_users_avatar.sql). */
  avatar_url: string | null;
  /** sha1-fingerprinted original Google URL — used to skip re-uploads. */
  google_picture_url_enc: string | null;
  avatar_updated_at_ms: number | null;
  given_name_enc: string | null;
  family_name_enc: string | null;
  locale_enc: string | null;
  created_at_ms: number;
  last_login_ms: number;
};
