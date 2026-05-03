import type { Redis } from "ioredis";

const TTL_SEC = 86400 * 7;

export function timesInMeetKey(jobId: string): string {
  return `meet-bot:times-in-meet:${jobId}`;
}

/** Mark that this job reached in-call / recording (once per worker run). */
export async function markTimesInMeet(redis: Redis, jobId: string): Promise<void> {
  await redis.set(timesInMeetKey(jobId), "1", "EX", TTL_SEC);
}

export async function getTimesInMeet(redis: Redis, jobId: string): Promise<number> {
  const v = await redis.get(timesInMeetKey(jobId));
  return v === "1" ? 1 : Number(v ?? 0);
}
