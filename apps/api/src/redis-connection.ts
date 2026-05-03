import { Redis } from "ioredis";
import { config } from "./config.js";

/** BullMQ requires maxRetriesPerRequest: null on the ioredis instance. */
export function createRedis(): Redis {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}
