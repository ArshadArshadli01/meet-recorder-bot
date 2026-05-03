"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationItem,
  type NotificationKind,
} from "../../lib/api";
import { subscribeJobEvents } from "../../lib/realtime";
import { AuthGate } from "../../components/AuthGate";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { formatBakuDateTime } from "../../lib/locale";
import { cn } from "../../lib/utils";
import { useMinimumSkeleton } from "../../lib/useMinimumSkeleton";

const PAGE_SIZE = 20;

type Tab = "all" | "unread";

const KIND_META: Record<
  NotificationKind,
  {
    label: string;
    tone: "default" | "success" | "danger" | "warning" | "secondary";
    icon: typeof Bell;
  }
> = {
  queued: { label: "Növbədə", tone: "warning", icon: Clock },
  started: { label: "Başladı", tone: "default", icon: Play },
  completed: { label: "Tamamlandı", tone: "success", icon: CheckCircle2 },
  failed: { label: "Uğursuz", tone: "danger", icon: AlertTriangle },
  system: { label: "Sistem", tone: "secondary", icon: Bell },
};

function kindIconClasses(tone: NotificationKind) {
  const meta = KIND_META[tone] ?? KIND_META.system;
  switch (meta.tone) {
    case "success":
      return "bg-success/15 text-success";
    case "danger":
      return "bg-destructive/15 text-destructive";
    case "warning":
      return "bg-warning/15 text-warning";
    case "default":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function kindBadge(kind: NotificationKind) {
  const meta = KIND_META[kind] ?? KIND_META.system;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.tone}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function dispatchChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  }
}

function NotificationsInner() {
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  /** When set, the centered modal is open and shows full notification details. */
  const [detail, setDetail] = useState<NotificationItem | null>(null);

  const reload = useCallback(async (nextTab: Tab) => {
    setItems(null);
    try {
      const res = await api.listNotifications({
        limit: PAGE_SIZE,
        offset: 0,
        unreadOnly: nextTab === "unread",
      });
      setItems(res.items);
      setTotal(res.total);
      setUnread(res.unread);
    } catch (err) {
      setItems([]);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload(tab);
  }, [tab, reload]);

  useEffect(() => {
    /** Auto-refresh badge counts on realtime notification events. */
    const unsub = subscribeJobEvents((evt) => {
      if (evt.kind === "notification") void reload(tab);
    });
    return () => unsub();
  }, [tab, reload]);

  /**
   * Close the detail modal on Escape (matches pakemlak's a11y behavior) and
   * lock body scroll while the modal is open so the page underneath cannot
   * jump.
   */
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [detail]);

  const loadMore = useCallback(async () => {
    if (!items || loadingMore) return;
    if (items.length >= (tab === "unread" ? unread : total)) return;
    setLoadingMore(true);
    try {
      const res = await api.listNotifications({
        limit: PAGE_SIZE,
        offset: items.length,
        unreadOnly: tab === "unread",
      });
      /** Dedupe in case a realtime event flipped a row between the two
       * server requests — without this we'd briefly render the same row
       * twice in the list. */
      setItems((prev) => {
        if (!prev) return res.items;
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setTotal(res.total);
      setUnread(res.unread);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore, tab, total, unread]);

  const hasMore =
    items !== null && items.length < (tab === "unread" ? unread : total);

  const feedLoading = items === null;
  const showFeedSkeleton = useMinimumSkeleton(feedLoading, 420);

  /**
   * Open detail modal and silently mark the row as read in the background —
   * the same UX pakemlak uses (read-on-open). Errors are swallowed so a brief
   * network blip doesn't pop a toast over the modal that just opened.
   */
  async function openDetail(item: NotificationItem) {
    setDetail(item);
    if (!item.isRead) {
      try {
        await api.markNotificationRead(item.id);
        setItems((prev) =>
          prev
            ? tab === "unread"
              ? prev.filter((i) => i.id !== item.id)
              : prev.map((i) =>
                  i.id === item.id ? { ...i, isRead: true } : i,
                )
            : prev,
        );
        setUnread((u) => Math.max(0, u - 1));
        dispatchChanged();
      } catch {
        /* swallow */
      }
    }
  }

  async function onMarkAllRead() {
    if (markAllBusy || unread === 0) return;
    setMarkAllBusy(true);
    try {
      await api.markAllNotificationsRead();
      setItems((prev) =>
        prev ? prev.map((i) => ({ ...i, isRead: true })) : prev,
      );
      setUnread(0);
      if (tab === "unread") setItems([]);
      dispatchChanged();
      toast.success("Bütün bildirişlər oxunmuş kimi qeyd edildi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setMarkAllBusy(false);
    }
  }

  async function onDelete(item: NotificationItem) {
    try {
      await api.deleteNotification(item.id);
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      setTotal((t) => Math.max(0, t - 1));
      if (!item.isRead) setUnread((u) => Math.max(0, u - 1));
      if (detail?.id === item.id) setDetail(null);
      dispatchChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bildirişlər</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {tab === "unread"
              ? `Oxunmamış: ${unread}`
              : `Cəmi: ${total}, oxunmamış: ${unread}`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onMarkAllRead}
          disabled={markAllBusy || unread === 0}
          className="gap-1.5"
        >
          <CheckCheck className="h-4 w-4" />
          {markAllBusy ? "Yenilənir..." : "Hamısını oxunmuş et"}
        </Button>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-1">
        {(
          [
            { id: "all", label: "Hamısı" },
            {
              id: "unread",
              label: `Oxunmamış${unread > 0 ? ` (${unread})` : ""}`,
            },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showFeedSkeleton || items === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <Card className="animate-content-fade-in flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="font-semibold">
            {tab === "unread" ? "Oxunmamış bildiriş yoxdur" : "Hələ bildiriş yoxdur"}
          </p>
          <p className="text-sm text-muted-foreground">
            Yeni record başlayanda və ya tamamlananda burada görünəcək.
          </p>
        </Card>
      ) : (
        <ul className="animate-content-fade-in flex flex-col gap-2">
          {items.map((item) => {
            const meta = KIND_META[item.kind] ?? KIND_META.system;
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(item)}
                  className={cn(
                    "mb-ripple-host group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left text-sm shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-primary/30 hover:bg-muted/40 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
                    !item.isRead && "border-primary/35 bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      kindIconClasses(item.kind),
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {kindBadge(item.kind)}
                      {!item.isRead ? (
                        <span
                          className="inline-flex h-2 w-2 rounded-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {formatBakuDateTime(item.createdAtMs)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-1 truncate text-sm",
                        !item.isRead
                          ? "font-semibold text-foreground"
                          : "font-medium text-foreground/90",
                      )}
                    >
                      {item.title}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
          {loadingMore ? (
            <li className="flex flex-col gap-2 list-none">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </li>
          ) : null}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="min-w-[200px] gap-1.5"
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {loadingMore ? "Yüklənir..." : "Daha Çox Göstər"}
          </Button>
        </div>
      ) : null}

      {detail ? (
        <NotificationDetail
          item={detail}
          onClose={() => setDetail(null)}
          onDelete={() => void onDelete(detail)}
        />
      ) : null}
    </div>
  );
}

/**
 * Centered modal mirroring pakemlak's `notifDetail` overlay. Backdrop click
 * closes; the panel is keyboard-focus trapped only loosely (Escape via the
 * parent effect). Nothing here renders into the list — the modal owns the
 * full body / error message / action buttons.
 */
function NotificationDetail({
  item,
  onClose,
  onDelete,
}: {
  item: NotificationItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  const meta = KIND_META[item.kind] ?? KIND_META.system;
  const Icon = meta.icon;
  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-detail-title"
    >
      <button
        type="button"
        aria-label="Bağla"
        onClick={onClose}
        className="animate-modal-backdrop absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="animate-modal-panel relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                kindIconClasses(item.kind),
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {kindBadge(item.kind)}
              </div>
              <h2
                id="notif-detail-title"
                className="mt-1.5 text-lg font-semibold leading-snug text-foreground"
              >
                {item.title}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatBakuDateTime(item.createdAtMs)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onClose}
            aria-label="Bağla"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {item.body ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tam mətn
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-background/80 p-3 text-sm leading-relaxed text-foreground">
                {item.body}
              </p>
            </div>
          ) : null}

          {item.errorMessage ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-destructive/80">
                Xəta detalı
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-destructive">
                {item.errorMessage}
              </p>
            </div>
          ) : null}

          {item.botId ? (
            <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Bot ID
                </dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                  {item.botId}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="gap-2 sm:order-1"
            onClick={() => {
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Sil
          </Button>
          {item.botId ? (
            <Link
              href={`/bots/${item.botId}`}
              onClick={onClose}
              className="mb-ripple-host inline-flex h-10 select-none items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-primary/90 hover:shadow-md active:translate-y-0 active:scale-[0.97] sm:order-3"
            >
              Recorda bax
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
          <Button
            type="button"
            className="sm:order-2"
            variant="secondary"
            onClick={onClose}
          >
            Bağla
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGate require>
      <AppShell>
        <NotificationsInner />
      </AppShell>
    </AuthGate>
  );
}
