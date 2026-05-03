import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";

/**
 * Tiny SQL migration runner. Goals:
 *   - Numbered files in `src/db/migrations/` applied in alphabetical order.
 *   - Each filename is recorded in `schema_migrations` so re-runs are no-ops.
 *   - Idempotent on existing deployments: if `users_secure` already exists
 *     (created by the legacy `ensureDbSchema`), migrations 001/002/003 are
 *     marked as already applied so we do not double-create.
 *
 * The runner uses a fresh `multipleStatements: true` connection so a single
 * .sql file can hold multiple statements (the rest of the app's pool stays
 * single-statement, which is the safe default).
 */

const MIGRATIONS_TABLE = "schema_migrations";
/** Files we treat as already-applied when bootstrapping an existing DB. */
const LEGACY_ENSURE_SCHEMA_FILES = [
  "001_users_secure.sql",
  "002_user_push_tokens.sql",
  "003_user_notifications.sql",
];

const __dirname = dirname(fileURLToPath(import.meta.url));

function migrationsDir(): string {
  /**
   * In `tsx watch` we run from `src/db/migrate.ts`, after `tsc` we run from
   * `dist/db/migrate.js` — both layouts keep `migrations/` next to this file.
   */
  return resolve(__dirname, "migrations");
}

function buildConnectionOptions(includeDatabase: boolean): mysql.ConnectionOptions {
  return {
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    ...(includeDatabase ? { database: config.mysqlDatabase } : {}),
    ssl: config.mysqlSsl ? {} : undefined,
    multipleStatements: true,
  };
}

async function ensureDatabaseExists(): Promise<void> {
  const conn = await mysql.createConnection(buildConnectionOptions(false));
  try {
    const safe = config.mysqlDatabase.replace(/`/g, "``");
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${safe}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end().catch(() => {});
  }
}

async function connect(): Promise<Connection> {
  try {
    return await mysql.createConnection(buildConnectionOptions(true));
  } catch (err) {
    if ((err as { code?: string })?.code === "ER_BAD_DB_ERROR") {
      await ensureDatabaseExists();
      return mysql.createConnection(buildConnectionOptions(true));
    }
    throw err;
  }
}

async function ensureTrackingTable(conn: Connection): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name VARCHAR(255) PRIMARY KEY,
      applied_at_ms BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

type AppliedRow = RowDataPacket & { name: string };
type CountRow = RowDataPacket & { c: number };

async function listApplied(conn: Connection): Promise<Set<string>> {
  const [rows] = await conn.query<AppliedRow[]>(
    `SELECT name FROM ${MIGRATIONS_TABLE}`
  );
  return new Set(rows.map((r) => r.name));
}

async function bootstrapLegacy(conn: Connection, applied: Set<string>): Promise<void> {
  /**
   * If we're talking to a database that was provisioned by the old inline
   * `ensureDbSchema` (so `users_secure` exists already) but `schema_migrations`
   * is fresh, mark 001-003 as applied so we don't re-run them. This makes the
   * runner safe to deploy to existing environments without manual SQL.
   */
  if (applied.size > 0) return;
  const [rows] = await conn.query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'users_secure'`,
    [config.mysqlDatabase]
  );
  if (!rows[0] || rows[0].c === 0) return;

  const now = Date.now();
  for (const name of LEGACY_ENSURE_SCHEMA_FILES) {
    await conn.query(
      `INSERT IGNORE INTO ${MIGRATIONS_TABLE} (name, applied_at_ms) VALUES (?, ?)`,
      [name, now]
    );
    applied.add(name);
  }

  /**
   * `004_user_notifications_extend.sql` only runs cleanly against the legacy
   * 3-column `user_notifications` table — but a partially-migrated DB might
   * already have `is_read`. Probe and pre-apply if those columns are present.
   */
  const [colRows] = await conn.query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'user_notifications' AND column_name = 'is_read'`,
    [config.mysqlDatabase]
  );
  if (colRows[0]?.c) {
    await conn.query(
      `INSERT IGNORE INTO ${MIGRATIONS_TABLE} (name, applied_at_ms) VALUES (?, ?)`,
      ["004_user_notifications_extend.sql", now]
    );
    applied.add("004_user_notifications_extend.sql");
  }
}

async function runFile(conn: Connection, name: string, sql: string): Promise<void> {
  await conn.beginTransaction();
  try {
    await conn.query(sql);
    await conn.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at_ms) VALUES (?, ?)`,
      [name, Date.now()]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw new Error(`Migration ${name} failed: ${(err as Error).message ?? err}`);
  }
}

let migrationsRan = false;

export async function runMigrations(opts: { force?: boolean } = {}): Promise<{
  appliedNow: string[];
  total: number;
}> {
  if (migrationsRan && !opts.force) return { appliedNow: [], total: 0 };
  const conn = await connect();
  const appliedNow: string[] = [];
  try {
    await ensureTrackingTable(conn);
    const applied = await listApplied(conn);
    await bootstrapLegacy(conn, applied);

    const dir = migrationsDir();
    const entries = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const name of entries) {
      if (applied.has(name)) continue;
      const sql = await readFile(join(dir, name), "utf8");
      await runFile(conn, name, sql);
      appliedNow.push(name);
    }
    migrationsRan = true;
    return { appliedNow, total: entries.length };
  } finally {
    await conn.end().catch(() => {});
  }
}

function isCliEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  /** `import.meta.url` is `file:///C:/path/to/file.ts` on Windows; comparing to
   * argv[1] across path separators is brittle, so just normalise both ends. */
  try {
    const here = fileURLToPath(import.meta.url).replace(/\\/g, "/");
    const entry = argv1.replace(/\\/g, "/");
    return here === entry || entry.endsWith("/migrate.ts") || entry.endsWith("/migrate.js");
  } catch {
    return false;
  }
}

if (isCliEntryPoint()) {
  runMigrations({ force: true })
    .then(({ appliedNow, total }) => {
      if (appliedNow.length === 0) {
        console.log(`[migrate] no pending migrations (${total} on disk)`);
      } else {
        console.log(`[migrate] applied ${appliedNow.length}/${total}: ${appliedNow.join(", ")}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
