import type { FastifyInstance } from "fastify";
import { requireUserId } from "./auth-routes.js";
import {
  upsertPushToken,
  removePushToken,
} from "../db/models/push-tokens.js";
import {
  deleteNotification,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "../db/models/notifications.js";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { token?: string } }>("/me/notifications/token", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const token = req.body?.token?.trim();
    if (!token) {
      reply.code(400);
      return { error: "token_required" };
    }
    const userAgent = req.headers["user-agent"]?.slice(0, 512) ?? null;
    await upsertPushToken(userId, token, userAgent);
    return { ok: true };
  });

  app.delete<{ Body: { token?: string } }>("/me/notifications/token", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const token = req.body?.token?.trim();
    if (!token) {
      reply.code(400);
      return { error: "token_required" };
    }
    await removePushToken(userId, token);
    return { ok: true };
  });

  /** List the in-app notification feed. `unread_only=1` filters to is_read=0. */
  app.get<{
    Querystring: { limit?: string; offset?: string; unread_only?: string };
  }>("/me/notifications", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const unreadOnly = req.query.unread_only === "1";
    return listNotifications({ userId, limit, offset, unreadOnly });
  });

  app.get("/me/notifications/unread-count", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    return { count: await unreadCount(userId) };
  });

  app.post<{ Params: { id: string } }>("/me/notifications/:id/read", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      reply.code(400);
      return { error: "invalid_id" };
    }
    const ok = await markRead(userId, id);
    if (!ok) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { ok: true };
  });

  app.post("/me/notifications/read-all", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const updated = await markAllRead(userId);
    return { ok: true, updated };
  });

  app.delete<{ Params: { id: string } }>("/me/notifications/:id", async (req, reply) => {
    const userId = await requireUserId(req, reply);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      reply.code(400);
      return { error: "invalid_id" };
    }
    const ok = await deleteNotification(userId, id);
    if (!ok) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { ok: true };
  });
}
