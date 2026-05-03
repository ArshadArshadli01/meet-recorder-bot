import type { Redis } from "ioredis";

const PREFIX = "meet-bot:cancel:";

export function cancelJobKey(jobId: string): string {
  return `${PREFIX}${jobId}`;
}

export async function requestJobCancel(redis: Redis, jobId: string): Promise<void> {
  await redis.set(cancelJobKey(jobId), "1", "EX", 86400);
}

export async function clearJobCancel(redis: Redis, jobId: string): Promise<void> {
  await redis.del(cancelJobKey(jobId));
}

export async function isJobCancelRequested(redis: Redis, jobId: string): Promise<boolean> {
  return (await redis.get(cancelJobKey(jobId))) === "1";
}
