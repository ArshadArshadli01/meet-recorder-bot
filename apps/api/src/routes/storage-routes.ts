import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  deleteUserObjectStorage,
  getUserObjectStoragePlain,
  getUserObjectStorageView,
  payloadToSpacesConfig,
  upsertUserObjectStorage,
  userHasObjectStorageRow,
  type UserObjectStoragePayload,
} from "../db/models/user-object-storage.js";
import { requireUserId } from "./auth-routes.js";

type PutBody = {
  access_key_id?: string;
  secret_access_key?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  public_base_url?: string;
};

function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export async function registerStorageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me/storage", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    if (config.appDemoMode) {
      return { configured: false as const, save_disabled: true as const };
    }
    if (!config.dataEncKey) {
      const hasRow = await userHasObjectStorageRow(userId);
      if (hasRow) {
        reply.code(503);
        return {
          error: "DATA_ENC_KEY is not configured — stored credentials cannot be read",
        };
      }
      return { configured: false as const, save_disabled: true as const };
    }
    return getUserObjectStorageView(userId);
  });

  app.put<{ Body: PutBody }>("/me/storage", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;

    if (!config.dataEncKey) {
      reply.code(503);
      return { error: "DATA_ENC_KEY is not configured — cannot store encrypted credentials" };
    }

    const b = req.body ?? {};
    const existing = await getUserObjectStoragePlain(userId);

    const accessKeyId = nonEmpty(b.access_key_id) ? b.access_key_id.trim() : null;
    const secretRaw = typeof b.secret_access_key === "string" ? b.secret_access_key : "";
    const secretAccessKey = secretRaw.trim() ? secretRaw.trim() : null;
    const endpoint = nonEmpty(b.endpoint) ? b.endpoint.trim() : null;
    const region = nonEmpty(b.region) ? b.region.trim() : null;
    const bucket = nonEmpty(b.bucket) ? b.bucket.trim() : null;
    const publicBaseUrl = nonEmpty(b.public_base_url) ? b.public_base_url.trim() : null;

    const merged: Partial<UserObjectStoragePayload> = {
      accessKeyId: accessKeyId ?? existing?.accessKeyId,
      secretAccessKey: secretAccessKey ?? existing?.secretAccessKey,
      endpoint: endpoint ?? existing?.endpoint,
      region: region ?? existing?.region,
      bucket: bucket ?? existing?.bucket,
      publicBaseUrl: publicBaseUrl ?? existing?.publicBaseUrl,
    };

    const missing: string[] = [];
    if (!merged.accessKeyId) missing.push("access_key_id");
    if (!merged.secretAccessKey) missing.push("secret_access_key");
    if (!merged.endpoint) missing.push("endpoint");
    if (!merged.region) missing.push("region");
    if (!merged.bucket) missing.push("bucket");
    if (!merged.publicBaseUrl) missing.push("public_base_url");

    if (missing.length > 0) {
      reply.code(400);
      return {
        error: `missing_or_empty_fields: ${missing.join(", ")}`,
        hint:
          "Provide all fields on first save; secret_access_key may be omitted when updating other fields only.",
      };
    }

    const payload = merged as UserObjectStoragePayload;
    /** Normalize like env-based Spaces config. */
    payloadToSpacesConfig(payload);

    await upsertUserObjectStorage(userId, payload);
    return { ok: true as const };
  });

  app.delete("/me/storage", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    await deleteUserObjectStorage(userId);
    return { ok: true as const };
  });
}
