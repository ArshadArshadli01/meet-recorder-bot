import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { SpacesConfig } from "./config.js";

/** One client per distinct bucket/endpoint/credential identity — avoids wrong uploads after switching users. */
const clientCache = new Map<string, S3Client>();

function clientCacheKey(spaces: SpacesConfig): string {
  return [spaces.endpoint, spaces.region, spaces.accessKeyId, spaces.bucket].join("\0");
}

function getClient(spaces: SpacesConfig): S3Client {
  const key = clientCacheKey(spaces);
  let c = clientCache.get(key);
  if (!c) {
    c = new S3Client({
      region: spaces.region,
      endpoint: spaces.endpoint,
      credentials: {
        accessKeyId: spaces.accessKeyId,
        secretAccessKey: spaces.secretAccessKey,
      },
      forcePathStyle: false,
    });
    clientCache.set(key, c);
  }
  return c;
}

function publicUrlFor(spaces: SpacesConfig, objectKey: string): string {
  const encodedKey = objectKey
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `${spaces.publicBaseUrl}/${encodedKey}`;
}

/**
 * Upload an in-memory Buffer (e.g. a freshly-downloaded avatar) and return
 * a public URL. We treat the body as opaque and let the caller pass an
 * explicit `contentType` because Buffers don't carry a filename to sniff.
 *
 * `cacheControl` defaults to a one-day private cache so that when a user
 * changes their Google avatar the new one propagates within 24h without us
 * needing CDN purge.
 */
export async function uploadBufferToSpaces(
  spaces: SpacesConfig,
  body: Buffer,
  objectKey: string,
  opts: { contentType: string; cacheControl?: string } = { contentType: "application/octet-stream" },
): Promise<string> {
  const c = getClient(spaces);
  await c.send(
    new PutObjectCommand({
      Bucket: spaces.bucket,
      Key: objectKey,
      Body: body,
      ContentType: opts.contentType,
      ACL: "public-read",
      CacheControl: opts.cacheControl ?? "public, max-age=86400",
    }),
  );
  return publicUrlFor(spaces, objectKey);
}

/**
 * Uploads a local file to DigitalOcean Spaces and returns a public HTTPS URL.
 * Objects are written with public-read so the public URL works when the bucket allows it.
 */
export async function uploadToSpaces(
  spaces: SpacesConfig,
  localFilePath: string,
  objectKey: string
): Promise<string> {
  const c = getClient(spaces);
  const body = createReadStream(localFilePath);
  const lower = localFilePath.toLowerCase();
  const contentType = lower.endsWith(".mp4")
    ? "video/mp4"
    : lower.endsWith(".webm")
      ? "video/webm"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".jsonl") || lower.endsWith(".json")
          ? "application/json"
          : lower.endsWith(".m4a") || lower.endsWith(".aac")
            ? "audio/mp4"
            : lower.endsWith(".wav")
              ? "audio/wav"
              : "application/octet-stream";

  await c.send(
    new PutObjectCommand({
      Bucket: spaces.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return publicUrlFor(spaces, objectKey);
}

export function buildObjectKey(botId: string, fileName: string): string {
  return `recordings/${botId}/${basename(fileName)}`;
}

/**
 * `spacesJobPrefix` məs: `meet-recordings/<drive_folder_id | bot_id>`
 * — əsas video və artifacts eyni məntiqi qovluqda.
 */
export function buildRecordingObjectKey(
  spacesJobPrefix: string,
  relativeUnderBotDir: string
): string {
  const clean = relativeUnderBotDir.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${spacesJobPrefix}/${clean}`;
}
