import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Redis } from "ioredis";

/** Shared with worker (`worker.ts`) — keep in sync. */
export const LOCAL_RECORDING_PURGE_ZSET = "meet-bot:local-recording-purge";

export const LOCAL_RECORDING_PURGE_DELAY_MS = 15 * 60 * 1000;

/**
 * Local-only jobs (no Drive / no S3) schedule disk cleanup after 15 minutes.
 * API `sweepDueLocalRecordingPurges` removes due directories.
 */
export async function sweepDueLocalRecordingPurges(
  redis: Redis,
  dataDir: string,
  log?: (msg: string) => void
): Promise<void> {
  const now = Date.now();
  const due = await redis.zrangebyscore(
    LOCAL_RECORDING_PURGE_ZSET,
    "-inf",
    now
  );
  for (const botId of due) {
    if (!/^[0-9a-f-]{36}$/i.test(botId)) {
      await redis.zrem(LOCAL_RECORDING_PURGE_ZSET, botId);
      continue;
    }
    const dir = join(dataDir, "recordings", botId);
    try {
      await rm(dir, { recursive: true, force: true });
      log?.(`[local-purge] removed ${dir}`);
    } catch (e) {
      log?.(`[local-purge] failed ${dir}: ${String(e)}`);
    }
    await redis.zrem(LOCAL_RECORDING_PURGE_ZSET, botId);
  }
}
