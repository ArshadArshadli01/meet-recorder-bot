import { io, type Socket } from "socket.io-client";
import type { BotResult, NotificationKind } from "./api";

export type JobEvent =
  | { kind: "state"; userId: string; botId: string; state: string; t: number }
  | { kind: "progress"; userId: string; botId: string; step: string; timesInMeet: number; t: number }
  | { kind: "completed"; userId: string; botId: string; result: BotResult; t: number }
  | { kind: "failed"; userId: string; botId: string; reason: string; t: number }
  | {
      kind: "notification";
      userId: string;
      notificationId: number;
      notifKind: NotificationKind;
      title: string;
      body: string;
      botId?: string;
      t: number;
    };

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket"], withCredentials: true });
  }
  return socket;
}

export function subscribeJobEvents(handler: (event: JobEvent) => void): () => void {
  const s = getSocket();
  s.on("job_event", handler);
  return () => s.off("job_event", handler);
}
