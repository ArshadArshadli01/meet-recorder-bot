import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const CIPHER = "aes-256-gcm";

type Envelope = {
  v: string;
  d: string;
};

function loadKey(): Buffer {
  const raw = config.dataEncKey;
  if (!raw) {
    throw new Error("DATA_ENC_KEY is required for MySQL encrypted fields.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENC_KEY must decode to 32 bytes (base64).");
  }
  return key;
}

export function encryptData(plain: string): string {
  const key = loadKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(CIPHER, key, nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([nonce, enc, tag]).toString("base64");
  const envelope: Envelope = { v: config.dataEncKeyVersion, d: payload };
  return JSON.stringify(envelope);
}

export function decryptData(encrypted: string): string {
  const key = loadKey();
  const parsed = JSON.parse(encrypted) as Envelope;
  if (!parsed?.d) {
    throw new Error("Invalid encrypted payload.");
  }
  const buf = Buffer.from(parsed.d, "base64");
  if (buf.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("Ciphertext too short.");
  }
  const nonce = buf.subarray(0, NONCE_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const enc = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(CIPHER, key, nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
