import type { RowDataPacket } from "mysql2/promise";
import type { SpacesConfig } from "../../config.js";
import { decryptData, encryptData } from "../../security/data-crypto.js";
import { db } from "../mysql.js";

export type UserObjectStoragePayload = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
};

type Row = RowDataPacket & { credentials_enc: string };

export function payloadToSpacesConfig(p: UserObjectStoragePayload): SpacesConfig {
  return {
    accessKeyId: p.accessKeyId.trim(),
    secretAccessKey: p.secretAccessKey.trim(),
    endpoint: p.endpoint.trim().replace(/\/$/, ""),
    region: p.region.trim(),
    bucket: p.bucket.trim(),
    publicBaseUrl: p.publicBaseUrl.trim().replace(/\/$/, ""),
  };
}

function maskAccessKeyId(id: string): string {
  const t = id.trim();
  if (t.length <= 4) return "****";
  return `****${t.slice(-4)}`;
}

export type UserObjectStorageView = {
  configured: true;
  endpoint: string;
  region: string;
  bucket: string;
  public_base_url: string;
  access_key_id_masked: string;
  secret_configured: true;
};

export async function userHasObjectStorageRow(userId: string): Promise<boolean> {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM user_object_storage WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

/** Decrypted payload or null if missing / corrupt / undecryptable. */
export async function getUserObjectStoragePlain(
  userId: string
): Promise<UserObjectStoragePayload | null> {
  const [rows] = await db().query<Row[]>(
    "SELECT credentials_enc FROM user_object_storage WHERE user_id = ? LIMIT 1",
    [userId]
  );
  const row = rows[0];
  if (!row?.credentials_enc) return null;
  try {
    const json = decryptData(row.credentials_enc);
    const o = JSON.parse(json) as Partial<UserObjectStoragePayload>;
    if (
      typeof o.accessKeyId !== "string" ||
      typeof o.secretAccessKey !== "string" ||
      typeof o.endpoint !== "string" ||
      typeof o.region !== "string" ||
      typeof o.bucket !== "string" ||
      typeof o.publicBaseUrl !== "string"
    ) {
      return null;
    }
    return {
      accessKeyId: o.accessKeyId,
      secretAccessKey: o.secretAccessKey,
      endpoint: o.endpoint,
      region: o.region,
      bucket: o.bucket,
      publicBaseUrl: o.publicBaseUrl,
    };
  } catch {
    return null;
  }
}

export async function getUserSpacesConfig(userId: string): Promise<SpacesConfig | null> {
  const plain = await getUserObjectStoragePlain(userId);
  if (!plain) return null;
  return payloadToSpacesConfig(plain);
}

export async function getUserObjectStorageView(
  userId: string
): Promise<{ configured: false } | UserObjectStorageView> {
  const plain = await getUserObjectStoragePlain(userId);
  if (!plain) return { configured: false };
  const s = payloadToSpacesConfig(plain);
  return {
    configured: true,
    endpoint: s.endpoint,
    region: s.region,
    bucket: s.bucket,
    public_base_url: s.publicBaseUrl,
    access_key_id_masked: maskAccessKeyId(s.accessKeyId),
    secret_configured: true,
  };
}

export async function upsertUserObjectStorage(
  userId: string,
  payload: UserObjectStoragePayload
): Promise<void> {
  const enc = encryptData(JSON.stringify(payload));
  const now = Date.now();
  await db().query(
    `INSERT INTO user_object_storage (user_id, credentials_enc, updated_at_ms)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE credentials_enc = VALUES(credentials_enc), updated_at_ms = VALUES(updated_at_ms)`,
    [userId, enc, now]
  );
}

export async function deleteUserObjectStorage(userId: string): Promise<void> {
  await db().query("DELETE FROM user_object_storage WHERE user_id = ?", [userId]);
}
