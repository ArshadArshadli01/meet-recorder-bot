import { config } from "../config.js";

/**
 * We talk to Google directly with `fetch` instead of pulling in the heavy `googleapis` package
 * (saves ~5MB in the worker image). The two endpoints we use are:
 *   - https://accounts.google.com/o/oauth2/v2/auth (consent screen)
 *   - https://oauth2.googleapis.com/token         (code/refresh exchange)
 *   - https://www.googleapis.com/oauth2/v3/userinfo (profile after login)
 *
 * Scopes:
 *   - openid + email + profile  → so we know who the user is
 *   - drive.file                → read/write only the Drive files THIS app creates (least privilege)
 */

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file",
];

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: "Bearer";
  id_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
  /** First name. Google's `userinfo` returns this when the `profile` scope is granted. */
  given_name?: string;
  /** Last name. Same source as `given_name`. */
  family_name?: string;
  picture?: string;
  /** BCP-47 locale, e.g. `en-US`. Useful for picking date/number formats. */
  locale?: string;
  email_verified?: boolean;
};

export function getRedirectUri(): string {
  return `${config.publicBaseUrl}/auth/google/callback`;
}

/**
 * Build the consent URL. We force `access_type=offline` + `prompt=consent` so Google reissues a
 * refresh_token even when the user has already granted scopes — otherwise re-login users would
 * have only an access_token and nothing for the worker to exchange after the original expires.
 */
export function buildAuthUrl(stateToken: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: stateToken,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 800)}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google refresh failed (${res.status}): ${body.slice(0, 800)}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google userinfo failed (${res.status}): ${body.slice(0, 800)}`);
  }
  return (await res.json()) as GoogleUserInfo;
}
