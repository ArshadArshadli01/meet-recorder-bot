/**
 * Session helpers — thin re-export of the MySQL-backed model so existing
 * callers (`req.unsignCookie(req.cookies[SESSION_COOKIE])` etc.) keep working
 * without churn. Sessions live in `sessions` table since the Redis-only
 * dataset migration; see `src/db/models/sessions.ts` for storage details.
 */
export {
  SESSION_COOKIE,
  SESSION_TTL_FOR_COOKIE_SECONDS,
  newSessionId,
  createSession,
  readSession,
  destroySession,
  cleanupExpiredSessions,
  type SessionRecord,
} from "../db/models/sessions.js";
