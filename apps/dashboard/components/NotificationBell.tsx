"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import {
  api,
  NOTIFICATIONS_CHANGED_EVENT,
} from "../lib/api";
import { subscribeJobEvents } from "../lib/realtime";
import { cn } from "../lib/utils";

const POLL_MS = 60_000;

export function NotificationBell({ className }: { className?: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await api.unreadNotifications();
        if (!cancelled) setUnread(res.count);
      } catch {
        /* ignore — will retry on next poll/event */
      }
    };
    void fetchUnread();
    const id = window.setInterval(fetchUnread, POLL_MS);

    const onChanged = () => void fetchUnread();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);

    const unsub = subscribeJobEvents((evt) => {
      if (evt.kind === "notification") {
        void fetchUnread();
      } else if (evt.kind === "completed" || evt.kind === "failed") {
        /** Worker fans out these events plus a notification row; refetching
         * is cheap and keeps the badge in sync without race conditions. */
        void fetchUnread();
      }
    });

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      unsub();
    };
  }, []);

  const display = unread > 99 ? "99+" : String(unread);

  return (
    <Link
      href="/notifications"
      aria-label="Bildirişlər"
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 ? (
        <span
          className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums"
          aria-hidden
        >
          {display}
        </span>
      ) : null}
    </Link>
  );
}
