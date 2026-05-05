import admin from "firebase-admin";
import { config } from "../config.js";
import { listPushTokens, removePushToken } from "../db/models/push-tokens.js";
import {
  createNotification,
  type NotificationKind,
} from "../db/models/notifications.js";
import { connection } from "../queue.js";
import {
  REALTIME_CHANNEL,
  type JobRealtimeEvent,
} from "../realtime-events.js";

let initialized = false;
let initFailed = false;

function hasFcmConfig(): boolean {
  return Boolean(config.fcmProjectId && config.fcmClientEmail && config.fcmPrivateKey);
}

function initFcm(): boolean {
  if (initialized) return true;
  if (initFailed) return false;
  if (!hasFcmConfig()) return false;
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.fcmProjectId,
        clientEmail: config.fcmClientEmail,
        privateKey: config.fcmPrivateKey,
      }),
    });
    initialized = true;
    return true;
  } catch (err) {
    initFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notifications] FCM init failed; push disabled:", msg);
    return false;
  }
}

async function publishNotificationEvent(input: {
  userId: string;
  notificationId: number;
  title: string;
  body: string;
  kind: NotificationKind;
  botId?: string;
}): Promise<void> {
  const evt: JobRealtimeEvent = {
    kind: "notification",
    userId: input.userId,
    notificationId: input.notificationId,
    notifKind: input.kind,
    title: input.title,
    body: input.body,
    botId: input.botId,
    t: Date.now(),
  };
  try {
    await connection.publish(REALTIME_CHANNEL, JSON.stringify(evt));
  } catch {
    /* best-effort — the bell will catch up via polling */
  }
}

/**
 * Persists one in-app notification row and (optionally) fans it out via FCM
 * to every push token registered for the user. The persistent row is the
 * source of truth for the in-app feed; the FCM push is best-effort and we
 * prune dead tokens as we discover them.
 */
export async function sendUserNotification(input: {
  userId: string;
  title: string;
  body: string;
  kind?: NotificationKind;
  data?: Record<string, string>;
}): Promise<void> {
  const kind: NotificationKind = input.kind ?? "system";
  const botId =
    typeof input.data?.botId === "string" ? input.data.botId : undefined;

  let notificationId = 0;
  try {
    notificationId = await createNotification({
      userId: input.userId,
      kind,
      title: input.title,
      body: input.body,
      status: "info",
      data: input.data,
      botId,
    });
  } catch (err) {
    /** DB write failed — still try to push so the user is not silently dropped. */
    console.error("[notifications] persist failed:", err);
  }

  if (notificationId > 0) {
    await publishNotificationEvent({
      userId: input.userId,
      notificationId,
      title: input.title,
      body: input.body,
      kind,
      botId,
    });
  }

  if (!initFcm()) return;
  const tokens = await listPushTokens(input.userId);
  if (tokens.length === 0) return;
  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: { title: input.title, body: input.body },
        data: input.data ?? {},
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("registration-token-not-registered")) {
        await removePushToken(input.userId, token);
      }
    }
  }
}
