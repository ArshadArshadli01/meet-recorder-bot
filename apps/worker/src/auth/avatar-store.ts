import { createHash } from "node:crypto";
import { config } from "../config.js";
import { uploadBufferToSpaces } from "../spaces-upload.js";

/**
 * Avatar self-hosting.
 *
 * Why self-host instead of just storing Google's `lh3.googleusercontent.com`
 * URL? Two reasons:
 *   1. Google rotates / 403s those URLs once the user's session ends, so
 *      anyone we render the avatar to (e.g. another teammate viewing the
 *      same workspace) eventually sees a broken image.
 *   2. We want the dashboard to keep working even when Google's CDN gates
 *      hot-linking by referrer or User-Agent.
 *
 * Flow on each successful login:
 *   1. Compute a stable URL fingerprint (sha1 of the original Google URL).
 *   2. If the user's stored fingerprint matches, skip — the avatar in S3
 *      is still fresh.
 *   3. Otherwise download the Google bytes, upload them to
 *      `avatars/<sub>/<fingerprint>.<ext>` in Spaces, and return the new
 *      public URL.
 *
 * If Spaces is not configured (`config.spaces` is null), we just return null
 * and the caller falls back to whatever Google URL we have.
 */

export type AvatarUploadResult = {
  url: string;
  /** sha1 of the original Google `picture` URL — used to skip future re-uploads. */
  sourceFingerprint: string;
};

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** sha1 is fine here — we only use it as a content-address, not for security. */
export function fingerprintAvatarUrl(googleUrl: string): string {
  return createHash("sha1").update(googleUrl).digest("hex");
}

/**
 * Download `googleUrl` and re-upload to Spaces. Returns null if Spaces is
 * not configured, the response was unsuccessful, or the content-type was
 * not a recognized image — never throws.
 */
export async function syncAvatarToSpaces(
  userId: string,
  googleUrl: string,
): Promise<AvatarUploadResult | null> {
  if (!config.spaces) return null;
  if (!googleUrl || !/^https?:\/\//i.test(googleUrl)) return null;

  let res: Response;
  try {
    /** Google's public avatar CDN does not require auth. We still spoof a
     * generic UA because some CDNs 403 a Node-`undici` UA. */
    res = await fetch(googleUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MeetBotAvatarSync/1.0; +https://github.com/your-org/meet-bot)",
        Accept: "image/*",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentTypeRaw = res.headers.get("content-type") || "image/jpeg";
  const contentType = contentTypeRaw.split(";")[0]!.trim().toLowerCase();
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) return null;

  /** Reasonable cap so a malicious Google response can't OOM us; real
   * avatars are well under 200 KB even at 512px. */
  const MAX_BYTES = 2 * 1024 * 1024;
  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_BYTES) return null;
  const buf = Buffer.from(arrayBuf);

  const fingerprint = fingerprintAvatarUrl(googleUrl);
  const key = `avatars/${userId}/${fingerprint}.${ext}`;

  try {
    const url = await uploadBufferToSpaces(config.spaces, buf, key, {
      contentType,
      /** Avatars are addressed by content-fingerprint so they never need to
       * change at the same key — long immutable cache is safe. */
      cacheControl: "public, max-age=31536000, immutable",
    });
    return { url, sourceFingerprint: fingerprint };
  } catch {
    return null;
  }
}
