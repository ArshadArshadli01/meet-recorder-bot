import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbUserRow } from "../mysql.js";
import { decryptSecret, encryptSecret } from "../../auth/crypto.js";
import { decryptData, encryptData } from "../../security/data-crypto.js";
import {
  fingerprintAvatarUrl,
  syncAvatarToSpaces,
} from "../../auth/avatar-store.js";

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  /** Google's original avatar URL (encrypted at rest). */
  picture?: string;
  /** Public S3 URL for the self-hosted copy. Prefer this in the UI. */
  avatarUrl?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
  refreshTokenEncrypted: string;
  createdAtMs: number;
  lastLoginMs: number;
};

/**
 * Upsert a user row. Called once per successful Google login. Refresh-token
 * is never overwritten with NULL — only with a fresh non-null value — so
 * silent re-logins (no `prompt=consent`) don't blow away the long-lived
 * refresh token Google issued the first time.
 *
 * Avatar handling: when we have a Google `picture` URL we compare its
 * fingerprint against the previously-stored one. If different (or missing),
 * we download + upload to Spaces in the background of this same call, then
 * store the public S3 URL. Spaces failure is *non-fatal* — login still
 * succeeds; we just keep the previous avatar (or none).
 */
export async function saveUser(input: {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
  refreshToken?: string;
}): Promise<void> {
  const now = Date.now();
  const [existingRows] = await db().query<DbUserRow[]>(
    `SELECT id, created_at_ms, avatar_url, google_picture_url_enc
     FROM users_secure WHERE id = ? LIMIT 1`,
    [input.id],
  );
  const existing = existingRows[0];
  const refreshTokenEncrypted = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : null;
  const createdAtMs = existing?.created_at_ms ?? now;

  /**
   * Decide whether to (re-)pull the avatar. We compare fingerprints rather
   * than full URLs because Google sometimes appends a `=s96-c` size hint
   * that changes per request without the underlying photo changing.
   */
  let avatarUrl: string | null = existing?.avatar_url ?? null;
  let googlePictureUrlEnc: string | null =
    existing?.google_picture_url_enc ?? null;
  let avatarUpdatedAtMs: number | null = null;

  if (input.picture) {
    const newFp = fingerprintAvatarUrl(input.picture);
    let prevFp: string | null = null;
    if (existing?.google_picture_url_enc) {
      try {
        prevFp = decryptData(existing.google_picture_url_enc);
      } catch {
        prevFp = null;
      }
    }
    if (newFp !== prevFp || !avatarUrl) {
      const uploaded = await syncAvatarToSpaces(input.id, input.picture);
      if (uploaded) {
        avatarUrl = uploaded.url;
        googlePictureUrlEnc = encryptData(uploaded.sourceFingerprint);
        avatarUpdatedAtMs = now;
      }
    }
  }

  await db().query<ResultSetHeader>(
    `INSERT INTO users_secure (
      id, email_enc, name_enc, picture_enc, refresh_token_enc,
      avatar_url, google_picture_url_enc, avatar_updated_at_ms,
      given_name_enc, family_name_enc, locale_enc,
      created_at_ms, last_login_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email_enc = VALUES(email_enc),
      name_enc = VALUES(name_enc),
      picture_enc = VALUES(picture_enc),
      refresh_token_enc = COALESCE(VALUES(refresh_token_enc), refresh_token_enc),
      avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
      google_picture_url_enc = COALESCE(VALUES(google_picture_url_enc), google_picture_url_enc),
      avatar_updated_at_ms = COALESCE(VALUES(avatar_updated_at_ms), avatar_updated_at_ms),
      given_name_enc = VALUES(given_name_enc),
      family_name_enc = VALUES(family_name_enc),
      locale_enc = VALUES(locale_enc),
      last_login_ms = VALUES(last_login_ms)`,
    [
      input.id,
      encryptData(input.email),
      input.name ? encryptData(input.name) : null,
      input.picture ? encryptData(input.picture) : null,
      refreshTokenEncrypted,
      avatarUrl,
      googlePictureUrlEnc,
      avatarUpdatedAtMs,
      input.givenName ? encryptData(input.givenName) : null,
      input.familyName ? encryptData(input.familyName) : null,
      input.locale ? encryptData(input.locale) : null,
      createdAtMs,
      now,
    ],
  );
}

export async function getUser(id: string): Promise<UserRecord | null> {
  const [rows] = await db().query<DbUserRow[]>(
    `SELECT id, email_enc, name_enc, picture_enc, refresh_token_enc,
            avatar_url, google_picture_url_enc, avatar_updated_at_ms,
            given_name_enc, family_name_enc, locale_enc,
            created_at_ms, last_login_ms
     FROM users_secure WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  let email = "";
  let name: string | undefined;
  let picture: string | undefined;
  let givenName: string | undefined;
  let familyName: string | undefined;
  let locale: string | undefined;
  try {
    email = decryptData(row.email_enc);
    name = row.name_enc ? decryptData(row.name_enc) : undefined;
    picture = row.picture_enc ? decryptData(row.picture_enc) : undefined;
    givenName = row.given_name_enc ? decryptData(row.given_name_enc) : undefined;
    familyName = row.family_name_enc
      ? decryptData(row.family_name_enc)
      : undefined;
    locale = row.locale_enc ? decryptData(row.locale_enc) : undefined;
  } catch {
    return null;
  }
  return {
    id: row.id ?? id,
    email,
    name,
    picture,
    avatarUrl: row.avatar_url ?? undefined,
    givenName,
    familyName,
    locale,
    refreshTokenEncrypted: row.refresh_token_enc ?? "",
    createdAtMs: Number(row.created_at_ms ?? 0),
    lastLoginMs: Number(row.last_login_ms ?? 0),
  };
}

/** Returns the *plaintext* refresh token, decrypted on the fly. Never log the result. */
export async function getUserRefreshToken(id: string): Promise<string | null> {
  const [rows] = await db().query<Array<{ refresh_token_enc: string | null } & DbUserRow>>(
    "SELECT refresh_token_enc FROM users_secure WHERE id = ? LIMIT 1",
    [id],
  );
  const enc = rows[0]?.refresh_token_enc;
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}
