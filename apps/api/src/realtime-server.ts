import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { connection } from "./queue.js";
import { config } from "./config.js";
import { SESSION_COOKIE, readSession } from "./auth/session.js";
import { REALTIME_CHANNEL, type JobRealtimeEvent, userRoom } from "./realtime-events.js";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const p of parts) {
    const [k, ...rest] = p.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Socket auth mirrors `/auth/me`: signed `mb_sid` cookie -> Redis session -> userId.
 * Every socket joins room `user:<id>` so we can fan out worker events without any polling.
 */
export async function setupRealtime(app: FastifyInstance): Promise<void> {
  const io = new SocketIOServer(app.server, {
    path: "/socket.io",
    cors: { origin: [config.dashboardOrigin, config.publicBaseUrl], credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const raw = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      if (!raw) return next(new Error("unauthorized"));
      const unsigned = app.unsignCookie(raw);
      if (!unsigned.valid || !unsigned.value) return next(new Error("unauthorized"));
      const session = await readSession(unsigned.value);
      if (!session) return next(new Error("unauthorized"));
      socket.data.userId = session.userId;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.data.userId ?? "");
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    socket.join(userRoom(userId));
    socket.emit("realtime_ready", { ok: true });
  });

  const sub = connection.duplicate();
  await sub.subscribe(REALTIME_CHANNEL);
  sub.on("message", (channel, payload) => {
    if (channel !== REALTIME_CHANNEL) return;
    try {
      const evt = JSON.parse(payload) as JobRealtimeEvent;
      io.to(userRoom(evt.userId)).emit("job_event", evt);
    } catch {
      /* ignore bad payload */
    }
  });

  app.addHook("onClose", async () => {
    await sub.quit().catch(() => {});
    await io.close();
  });
}
