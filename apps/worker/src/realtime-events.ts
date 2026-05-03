import type { MeetJobResult } from "./types.js";

export const REALTIME_CHANNEL = "meet-bot:events";

export type RealtimeNotificationKind =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "system";

export type JobRealtimeEvent =
  | {
      kind: "state";
      userId: string;
      botId: string;
      state: string;
      t: number;
    }
  | {
      kind: "progress";
      userId: string;
      botId: string;
      step: string;
      timesInMeet: number;
      t: number;
    }
  | {
      kind: "completed";
      userId: string;
      botId: string;
      result: MeetJobResult;
      t: number;
    }
  | {
      kind: "failed";
      userId: string;
      botId: string;
      reason: string;
      t: number;
    }
  | {
      kind: "notification";
      userId: string;
      notificationId: number;
      notifKind: RealtimeNotificationKind;
      title: string;
      body: string;
      botId?: string;
      t: number;
    };

export function userRoom(userId: string): string {
  return `user:${userId}`;
}
