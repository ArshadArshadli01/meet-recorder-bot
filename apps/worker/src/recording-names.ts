/**
 * İctimai fayl adları: Bakı vaxtı + Meet otaq kodu + bot UUID (Drive/S3 üçün eyni məntiqi).
 */

/** Google Meet URL-dən otaq kodu (məs. `iya-dfxi-oyg`). */
export function meetCodeFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** Fayl sistemi üçün təhlükəsiz seqment (Windows/Linux). */
export function sanitizeFilenameSegment(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

/** Bakı saat qurşağında `YYYY-MM-DD_HH-mm-ss`. */
export function formatRecordingTimestampBaku(ms: number): string {
  const [date, time] = new Date(ms)
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .split(" ");
  return `${date}_${time.replace(/:/g, "-")}`;
}

/**
 * Əsas ad (uzantısız): tarix_saat_meet_kodu_bot_id
 * Məs: `2026-05-03_14-30-45_iya-dfxi-oyg_d4dc81d0-9209-4391-b04d-1021125c6798`
 */
export function buildRecordingBaseName(
  startedAtMs: number,
  meetingUrl: string | undefined,
  botId: string
): string {
  const ts = formatRecordingTimestampBaku(startedAtMs);
  const code = sanitizeFilenameSegment(meetCodeFromUrl(meetingUrl) ?? "meet");
  const id = sanitizeFilenameSegment(botId);
  return `${ts}_${code}_${id}`;
}

export function extensionFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".webm")) return ".webm";
  if (lower.endsWith(".mp4")) return ".mp4";
  if (lower.endsWith(".m4a")) return ".m4a";
  if (lower.endsWith(".wav")) return ".wav";
  const i = filePath.lastIndexOf(".");
  return i >= 0 ? filePath.slice(i).toLowerCase() : "";
}
