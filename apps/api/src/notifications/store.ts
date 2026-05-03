/**
 * Compatibility shim — push tokens + delivery logging used to live here. The
 * data now lives in the new MySQL model layer; we re-export so existing
 * callers keep their import paths.
 */
export {
  upsertPushToken,
  removePushToken,
  listPushTokens,
} from "../db/models/push-tokens.js";

export {
  createNotification,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  type NotificationRow,
  type NotificationKind,
  type NotificationStatus,
} from "../db/models/notifications.js";

import { createNotification } from "../db/models/notifications.js";

/**
 * Backwards-compatible delivery logger used by the FCM push path. Kept as a
 * thin wrapper over `createNotification` so older call sites still work; new
 * callers should use `createNotification` directly with a richer `kind`.
 */
export async function logNotificationDelivery(input: {
  userId: string;
  title: string;
  body: string;
  status: "sent" | "failed";
  errorMessage?: string;
  botId?: string;
}): Promise<void> {
  await createNotification({
    userId: input.userId,
    kind: "system",
    title: input.title,
    body: input.body,
    status: input.status,
    errorMessage: input.errorMessage,
    botId: input.botId,
  });
}
