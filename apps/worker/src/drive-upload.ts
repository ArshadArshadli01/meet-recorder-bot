import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { refreshAccessToken } from "./auth/google-oauth.js";
import { getUserRefreshToken } from "./auth/user-store.js";
import type { Redis } from "ioredis";

/**
 * Direct REST upload to Google Drive (we avoid the heavy `googleapis` package — only ~300 lines
 * of code here vs. an extra 5MB image layer). For files larger than ~5MB we use the **resumable**
 * upload protocol because a flaky uplink can drop a multi-hundred-MB MP4 mid-flight; resumable
 * lets us retry without re-uploading the entire body.
 *
 * https://developers.google.com/drive/api/guides/manage-uploads#resumable
 */

export type DriveUploadResult = {
  fileId: string;
  webViewLink: string;
};
export type DriveFolderResult = {
  folderId: string;
  webViewLink: string;
};

/** Resumable threshold — files above this size use the chunked protocol. */
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024;

export type DriveUploadInput = {
  redis: Redis;
  userId: string;
  filePath: string;
  /** Filename to show in Drive (defaults to the basename of `filePath`). */
  driveName?: string;
  /** Optional Drive folder id; when set, the file is created inside that folder. */
  parentFolderId?: string;
  /** MIME type for the upload — caller already knows it (`video/mp4` for the recording). */
  mimeType: string;
};

async function getAccessToken(
  redis: Redis,
  userId: string
): Promise<string> {
  const refresh = await getUserRefreshToken(redis, userId);
  if (!refresh) {
    throw new Error(
      `User ${userId} has no usable refresh token — they need to log in again to grant Drive access.`
    );
  }
  const tokens = await refreshAccessToken(refresh);
  if (!tokens.access_token) {
    throw new Error("Google refresh succeeded but returned no access_token.");
  }
  return tokens.access_token;
}

function buildMetadata(input: {
  name: string;
  parentFolderId?: string;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = { name: input.name };
  if (input.parentFolderId) {
    meta.parents = [input.parentFolderId];
  }
  return meta;
}

function viewLinkForFileId(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
function viewLinkForFolderId(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function looksLikeDriveId(v: string): boolean {
  return /^[A-Za-z0-9_-]{10,}$/.test(v.trim());
}

async function uploadResumable(
  accessToken: string,
  filePath: string,
  size: number,
  metadata: Record<string, unknown>,
  mimeType: string
): Promise<DriveUploadResult> {
  /** Step 1: open a resumable session — Google returns the upload URL in `Location`. */
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`Drive resumable init failed (${initRes.status}): ${body.slice(0, 800)}`);
  }
  const sessionUrl = initRes.headers.get("location");
  if (!sessionUrl) {
    throw new Error("Drive resumable init returned no Location header.");
  }

  /** Step 2: PUT the entire body at once. fetch() supports streaming a ReadableStream from
   *  fs.createReadStream via Node 18+; the resumable URL accepts a single-shot PUT just fine and
   *  Google returns the final file metadata when the upload finishes. */
  const stream = createReadStream(filePath);
  /** Cast required: Node fetch types don't yet accept Readable as BodyInit, but it works at runtime. */
  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(size),
    },
    body: stream as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`Drive resumable PUT failed (${putRes.status}): ${body.slice(0, 800)}`);
  }
  const json = (await putRes.json()) as { id?: string };
  if (!json.id) throw new Error("Drive upload returned no file id.");
  return { fileId: json.id, webViewLink: viewLinkForFileId(json.id) };
}

async function uploadMultipart(
  accessToken: string,
  filePath: string,
  metadata: Record<string, unknown>,
  mimeType: string
): Promise<DriveUploadResult> {
  /**
   * Multipart for small files — single round-trip, no resumable session URL. We build the body
   * by hand because Node's `Blob`/`FormData` mishandle the strict CRLF boundary Google expects.
   */
  const boundary = `mb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const fileBuf = await (async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(filePath);
  })();

  const body = Buffer.concat([Buffer.from(head, "utf8"), fileBuf, Buffer.from(tail, "utf8")]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive multipart upload failed (${res.status}): ${text.slice(0, 800)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Drive multipart upload returned no file id.");
  return { fileId: json.id, webViewLink: viewLinkForFileId(json.id) };
}

function isParentFolderNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("file not found") &&
    (msg.includes('"location":"fileid"') ||
      msg.includes('"location": "fileid"') ||
      msg.includes("locationtype") ||
      msg.includes("notfound"))
  );
}

export async function uploadFileToUserDrive(
  input: DriveUploadInput
): Promise<DriveUploadResult> {
  const stats = await stat(input.filePath);
  const accessToken = await getAccessToken(input.redis, input.userId);
  const uploadWithParent = async (parentFolderId?: string): Promise<DriveUploadResult> => {
    const metadata = buildMetadata({
      name: input.driveName ?? basename(input.filePath),
      parentFolderId,
    });
    if (stats.size >= RESUMABLE_THRESHOLD_BYTES) {
      return uploadResumable(accessToken, input.filePath, stats.size, metadata, input.mimeType);
    }
    return uploadMultipart(accessToken, input.filePath, metadata, input.mimeType);
  };

  try {
    return await uploadWithParent(input.parentFolderId);
  } catch (err) {
    if (!input.parentFolderId || !isParentFolderNotFoundError(err)) throw err;
    // User supplied a label/path (or inaccessible folder) instead of a Drive folder id.
    // Fall back to My Drive root instead of failing the whole job.
    return uploadWithParent(undefined);
  }
}

/** Best-guess MIME type from filename suffix — Drive otherwise stores files as `application/octet-stream`. */
export function mimeTypeForRecording(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

export async function createDriveFolder(input: {
  redis: Redis;
  userId: string;
  folderName: string;
  parentFolderId?: string;
}): Promise<DriveFolderResult> {
  const accessToken = await getAccessToken(input.redis, input.userId);
  const create = async (parentFolderId?: string): Promise<DriveFolderResult> => {
    const metadata: Record<string, unknown> = {
      name: input.folderName,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentFolderId) metadata.parents = [parentFolderId];
    const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive folder create failed (${res.status}): ${text.slice(0, 800)}`);
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new Error("Drive folder create returned no id.");
    return { folderId: json.id, webViewLink: viewLinkForFolderId(json.id) };
  };

  try {
    return await create(input.parentFolderId);
  } catch (err) {
    if (!input.parentFolderId || !isParentFolderNotFoundError(err)) throw err;
    return create(undefined);
  }
}

export async function resolveDriveFolderIdOrName(input: {
  redis: Redis;
  userId: string;
  folderIdOrName?: string;
}): Promise<string | undefined> {
  const raw = input.folderIdOrName?.trim();
  if (!raw) return undefined;
  if (looksLikeDriveId(raw)) return raw;
  const created = await createDriveFolder({
    redis: input.redis,
    userId: input.userId,
    folderName: raw,
  });
  return created.folderId;
}
