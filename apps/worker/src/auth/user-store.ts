/**
 * Thin compatibility shim around the new MySQL-only model layer. Pre-migration
 * the user store was a Redis hash + sorted set. Today everything user-related
 * lives in MySQL: `users_secure` (PII) and `user_bots` (job ownership index).
 *
 * Existing call sites still pass `redis` as the first argument so the type
 * stays the same; we ignore it here and dispatch to the model functions.
 * Drive upload + worker callers can keep working unchanged.
 */
import type { Redis } from "ioredis";
import {
  getUser as modelGetUser,
  getUserRefreshToken as modelGetUserRefreshToken,
  saveUser as modelSaveUser,
  type UserRecord,
} from "../db/models/users.js";
import {
  countUserBots as modelCountUserBots,
  getJobOwner as modelGetJobOwner,
  listUserBotIds as modelListUserBotIds,
  recordUserBot as modelRecordUserBot,
} from "../db/models/user-bots.js";

export type { UserRecord };

export async function saveUser(
  _redis: Redis,
  input: Parameters<typeof modelSaveUser>[0]
): Promise<void> {
  await modelSaveUser(input);
}

export async function getUser(_redis: Redis, id: string): Promise<UserRecord | null> {
  return modelGetUser(id);
}

export async function getUserRefreshToken(
  _redis: Redis,
  id: string
): Promise<string | null> {
  return modelGetUserRefreshToken(id);
}

export async function recordUserBot(
  _redis: Redis,
  userId: string,
  jobId: string,
  createdAtMs: number
): Promise<void> {
  await modelRecordUserBot(userId, jobId, createdAtMs);
}

export async function listUserBotIds(
  _redis: Redis,
  userId: string,
  limit: number,
  offset = 0
): Promise<string[]> {
  return modelListUserBotIds(userId, limit, offset);
}

export async function getJobOwner(
  _redis: Redis,
  jobId: string
): Promise<string | null> {
  return modelGetJobOwner(jobId);
}

export async function countUserBots(
  _redis: Redis,
  userId: string
): Promise<number> {
  return modelCountUserBots(userId);
}
