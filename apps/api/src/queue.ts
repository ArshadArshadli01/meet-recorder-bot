import { Queue } from "bullmq";
import { config } from "./config.js";
import { createRedis } from "./redis-connection.js";

/** Shared Redis connection for BullMQ Queue and cancel flags (same DB as worker). */
export const connection = createRedis();

export const meetQueue = new Queue(config.queueName, { connection });

export async function closeQueue(): Promise<void> {
  await meetQueue.close();
  await connection.quit();
}
