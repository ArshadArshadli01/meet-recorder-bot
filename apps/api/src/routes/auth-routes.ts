import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { config, isAuthConfigured } from "../config.js";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
} from "../auth/google-oauth.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_FOR_COOKIE_SECONDS,
  createSession,
  destroySession,
  readSession,
} from "../auth/session.js";
import { getUser, saveUser } from "../db/models/users.js";
import type { FastifyRequest } from "fastify";

/**
 * OAuth state cookie (`mb_oauth_state`) is short-lived and signed; we compare it to the `state`
 * Google echoes back in the callback. This is the standard CSRF defense for OAuth Authorization
 * Code flow — without it, an attacker could trick a logged-in user into linking the attacker's
 * Google account to their browser session.
 */
const OAUTH_STATE_COOKIE = "mb_oauth_state";
const OAUTH_RETURN_COOKIE = "mb_oauth_return";

function cookieOptions(req: FastifyRequest) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.protocol === "https",
    signed: true,
  };
}

function clearAuthCookies(req: FastifyRequest, reply: FastifyReply): void {
  const opts = cookieOptions(req);
  reply.clearCookie(OAUTH_STATE_COOKIE, opts);
  reply.clearCookie(OAUTH_RETURN_COOKIE, opts);
}

function safeReturnTarget(raw: string | undefined): string {
  if (!raw) return "/";
  if (raw.startsWith(config.dashboardOrigin)) {
    const rest = raw.slice(config.dashboardOrigin.length);
    return safeReturnTarget(rest || "/");
  }
  /** Only allow app paths so a crafted ?return=https://evil.example cannot redirect off-site. */
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.length > 512) return "/";
  return raw;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/status", async () => ({
    configured: isAuthConfigured(),
    publicBaseUrl: config.publicBaseUrl,
    appDemoMode: config.appDemoMode,
  }));

  app.get<{ Querystring: { return?: string } }>("/auth/google/start", async (req, reply) => {
    if (!isAuthConfigured()) {
      reply.code(503);
      return {
        error:
          "Auth is not configured (missing GOOGLE_CLIENT_ID/SECRET/SESSION_SECRET/TOKEN_ENC_KEY/DATA_ENC_KEY on the server).",
      };
    }
    const state = randomBytes(24).toString("base64url");
    const oneHour = 60 * 60;
    reply.setCookie(OAUTH_STATE_COOKIE, state, { ...cookieOptions(req), maxAge: oneHour });
    reply.setCookie(OAUTH_RETURN_COOKIE, safeReturnTarget(req.query.return), {
      ...cookieOptions(req),
      maxAge: oneHour,
    });
    reply.redirect(buildAuthUrl(state), 302);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/google/callback",
    async (req, reply) => {
      if (!isAuthConfigured()) {
        reply.code(503);
        return { error: "Auth is not configured." };
      }
      const { code, state, error } = req.query;
      if (error) {
        clearAuthCookies(req, reply);
        reply.code(400);
        return { error: `Google returned: ${error}` };
      }
      if (!code || !state) {
        clearAuthCookies(req, reply);
        reply.code(400);
        return { error: "Missing code or state from Google." };
      }
      const rawStateCookie = req.cookies[OAUTH_STATE_COOKIE] ?? "";
      const stateCookie = req.unsignCookie(rawStateCookie);
      if (!stateCookie.valid || stateCookie.value !== state) {
        req.log.warn(
          {
            hasCookie: !!rawStateCookie,
            cookieValid: stateCookie.valid,
            cookieValue: stateCookie.value?.slice(0, 8) ?? null,
            queryState: state?.slice(0, 8) ?? null,
            protocol: req.protocol,
            host: req.hostname,
            allCookieKeys: Object.keys(req.cookies),
          },
          "oauth_state_mismatch"
        );
        clearAuthCookies(req, reply);
        reply.code(400);
        return { error: "OAuth state mismatch — possible CSRF; please retry login." };
      }

      try {
        const tokens = await exchangeCodeForTokens(code);
        const profile = await fetchUserInfo(tokens.access_token);
        if (!profile.sub || !profile.email) {
          throw new Error("Google profile missing sub/email — refusing to create session.");
        }

        await saveUser({
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          givenName: profile.given_name,
          familyName: profile.family_name,
          locale: profile.locale,
          refreshToken: tokens.refresh_token,
        });

        const sid = await createSession(profile.sub);
        reply.setCookie(SESSION_COOKIE, sid, {
          ...cookieOptions(req),
          maxAge: SESSION_TTL_FOR_COOKIE_SECONDS,
        });

        const returnCookie = req.unsignCookie(req.cookies[OAUTH_RETURN_COOKIE] ?? "");
        const target = returnCookie.valid ? safeReturnTarget(returnCookie.value ?? "/") : "/";
        clearAuthCookies(req, reply);
        reply.redirect(`${config.dashboardOrigin}${target}`, 302);
      } catch (err) {
        clearAuthCookies(req, reply);
        req.log.error({ err }, "google_callback_failed");
        reply.code(500);
        return {
          error: "Google sign-in failed. Check server logs for details.",
        };
      }
    }
  );

  app.post("/auth/logout", async (req, reply) => {
    const sidCookie = req.unsignCookie(req.cookies[SESSION_COOKIE] ?? "");
    if (sidCookie.valid && sidCookie.value) {
      await destroySession(sidCookie.value).catch(() => {});
    }
    /** Use the same cookie options as setCookie (path/samesite/secure/signed), otherwise some
     * browsers keep the old cookie and user appears "still logged in". */
    reply.clearCookie(SESSION_COOKIE, cookieOptions(req));
    return { ok: true };
  });

  app.get("/auth/me", async (req, reply) => {
    if (config.appDemoMode) {
      return {
        authenticated: true,
        user: {
          id: "demo-user-id",
          email: "demo@example.com",
          name: "Demo User",
          picture: "/default-user.jpg",
          givenName: "Demo",
          familyName: "User",
          locale: "az",
          demo: true,
        },
      };
    }
    const sidCookie = req.unsignCookie(req.cookies[SESSION_COOKIE] ?? "");
    if (!sidCookie.valid || !sidCookie.value) {
      reply.code(401);
      return { authenticated: false };
    }
    const session = await readSession(sidCookie.value);
    if (!session) {
      reply.code(401);
      return { authenticated: false };
    }
    const user = await getUser(session.userId);
    if (!user) {
      reply.code(401);
      return { authenticated: false };
    }
    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        /** UI prefers `avatarUrl` (our S3 copy) and falls back to `picture` (Google CDN). */
        picture: user.avatarUrl ?? user.picture,
        avatarUrl: user.avatarUrl,
        googlePictureUrl: user.picture,
        givenName: user.givenName,
        familyName: user.familyName,
        locale: user.locale,
      },
    };
  });
}

/**
 * Helper for protected routes — returns the userId or sends a 401 and returns null. Centralized so
 * every `/me/...` route uses the same cookie-validation logic and stays in sync with `/auth/me`.
 */
export async function requireUserId(
  req: import("fastify").FastifyRequest,
  reply: FastifyReply
): Promise<string | null> {
  if (config.appDemoMode) return "demo-user-id";
  const sidCookie = req.unsignCookie(req.cookies[SESSION_COOKIE] ?? "");
  if (!sidCookie.valid || !sidCookie.value) {
    reply.code(401);
    reply.send({ error: "not_authenticated" });
    return null;
  }
  const session = await readSession(sidCookie.value);
  if (!session) {
    reply.code(401);
    reply.send({ error: "session_expired" });
    return null;
  }
  return session.userId;
}
