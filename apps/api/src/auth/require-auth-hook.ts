/**
 * Global Fastify `onRequest` hook that enforces authentication on every route
 * except a small allowlist of public endpoints (health, version, auth/OAuth).
 *
 * Accepted credentials (any one is sufficient):
 *   1. Valid signed session cookie (`mb_sid`) → authenticated user.
 *   2. `Authorization: Bearer <INTERNAL_API_KEY>` or `X-API-Key` header.
 *
 * When neither is present the request is rejected with 401 before the route
 * handler executes.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { internalApiKeyValid } from "./internal-api-key.js";
import { SESSION_COOKIE, readSession } from "./session.js";

/**
 * Path prefixes / exact paths that are accessible without any authentication.
 * Everything else requires a valid session cookie or INTERNAL_API_KEY.
 */
const PUBLIC_PREFIXES: string[] = [
  "/health",
  "/version",
  "/auth/",        // /auth/status, /auth/google/start, /auth/google/callback, /auth/me, /auth/logout
];

/** Exact-match public paths (no trailing sub-path). */
const PUBLIC_EXACT: Set<string> = new Set([
  "/health",
  "/version",
  "/auth/status",
  "/auth/google/start",
  "/auth/google/callback",
  "/auth/me",
  "/auth/logout",
]);

function isPublicRoute(url: string): boolean {
  // Strip query string for matching
  const path = url.split("?")[0] ?? url;

  if (PUBLIC_EXACT.has(path)) return true;

  for (const prefix of PUBLIC_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return true;
  }

  return false;
}

async function hasValidSession(request: FastifyRequest): Promise<boolean> {
  try {
    const rawCookie = request.cookies[SESSION_COOKIE];
    if (!rawCookie) return false;
    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) return false;
    const session = await readSession(unsigned.value);
    return session !== null;
  } catch {
    return false;
  }
}

export async function requireAuthHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const url = request.raw.url ?? request.url;

  // Allow public routes through without auth
  if (isPublicRoute(url)) return;

  // If in demo mode, bypass security checks for local testing
  if (config.appDemoMode) return;

  // Check INTERNAL_API_KEY (fast, synchronous-ish)
  if (config.internalApiKey && internalApiKeyValid(request)) return;

  // Check session cookie
  if (await hasValidSession(request)) return;

  // Neither credential is valid — reject
  reply.code(401);
  reply.send({
    error: "unauthorized",
    message:
      "Authentication required. Sign in to obtain a session, or provide INTERNAL_API_KEY via Authorization: Bearer <token> or X-API-Key header.",
  });
}

/**
 * Register the global auth guard. Call this **after** cookie plugin is registered
 * but **before** routes are added (or use `onRequest` which runs before handlers).
 */
export function registerAuthGuard(app: FastifyInstance): void {
  app.addHook("onRequest", requireAuthHook);
  app.log.info(
    "[security] Global auth guard enabled — all routes except /health, /version, and /auth/* require authentication"
  );
}
