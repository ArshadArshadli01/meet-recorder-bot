import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

/**
 * AES-256-GCM with a per-record random 12-byte nonce. We store `nonce || ciphertext || tag`
 * base64-encoded so a Redis dump never reveals refresh tokens even if the dump file leaks.
 *
 * Rotating `TOKEN_ENC_KEY` invalidates every stored token (decryption throws); users will need
 * to re-auth. That is intentional — the key is the last line of defense if Redis is compromised.
 */

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const raw = config.tokenEncKey;
  if (!raw) {
    throw new Error(
      "TOKEN_ENC_KEY is not set; refresh-token encryption is disabled. Generate one with `openssl rand -base64 32`."
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENC_KEY must decode to 32 bytes (got ${buf.length}). Use \`openssl rand -base64 32\`.`
    );
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, enc, tag]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = loadKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("Ciphertext too short — TOKEN_ENC_KEY may have changed since this token was stored.");
  }
  const nonce = buf.subarray(0, NONCE_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const enc = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
