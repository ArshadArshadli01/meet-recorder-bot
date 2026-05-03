import type { BotResult } from "./api";

/**
 * Dashboard `/api/*` → API `GET /recordings/:botId/*` (Fastify `server.ts`).
 * `relativePath` worker-dən gəlir: `recordings/<uuid>/…` (DATA_DIR-ə nisbətən).
 */
export function recordingFileHref(botId: string, relativePath: string): string | null {
  const n = relativePath.replace(/\\/g, "/").trim();
  if (!n) return null;
  const parts = n.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0]?.toLowerCase() !== "recordings") return null;
  const id = parts[1];
  if (!id || id.toLowerCase() !== botId.toLowerCase()) return null;
  const rest = parts.slice(2).join("/");
  if (!rest) return null;
  const encodedRest = rest
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/recordings/${encodeURIComponent(id)}/${encodedRest}`;
}

export function googleDriveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export type PrimaryVideoOpen =
  | { href: string; source: "drive" }
  | { href: string; source: "spaces" }
  | { href: string; source: "server" };

/** Tam video keçidləri — bulud varsa yerli `/api/recordings` ünvanı verilmir. */
export function getVideoLinks(botId: string, result: BotResult): {
  driveUrl: string | undefined;
  spacesUrl: string | undefined;
  /** Yalnız Drive və S3 keçidləri yoxdursa (fayl yalnız serverdədirsə). */
  localApiHref: string | null;
} {
  let driveUrl: string | undefined;
  if (result.drive_file_id) {
    driveUrl = googleDriveFileViewUrl(result.drive_file_id);
  } else {
    const du = result.drive_url?.trim();
    if (du?.includes("/file/d/")) driveUrl = du;
  }

  const spacesUrl = result.spaces_url?.trim() || undefined;

  /** Yerli fayl hələ diskdədirsə — bulud keçidləri uğursuz olanda da göstərilir. */
  let localApiHref: string | null = null;
  if (result.relativePath) {
    localApiHref = recordingFileHref(botId, result.relativePath);
  }

  return { driveUrl, spacesUrl, localApiHref };
}

/** Tək əsas keçid (köhnə məntiq): Drive → S3 → yerli. UI üçün üstünlüklə `getVideoLinks` istifadə edin. */
export function primaryVideoOpen(botId: string, result: BotResult): PrimaryVideoOpen | null {
  const { driveUrl, spacesUrl, localApiHref } = getVideoLinks(botId, result);
  if (driveUrl) return { href: driveUrl, source: "drive" };
  if (spacesUrl) return { href: spacesUrl, source: "spaces" };
  if (localApiHref) return { href: localApiHref, source: "server" };
  return null;
}

/** Qovluq nişanı üçün — yeni işçi `drive_folder_url` göndərir; köhnə işlər üçün `drive_url` qovluq linki ola bilər. */
export function driveFolderWebLink(result: BotResult): string | undefined {
  if (result.drive_folder_url) return result.drive_folder_url;
  const du = result.drive_url;
  if (du?.includes("/drive/folders/")) return du;
  return undefined;
}
