"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Cloud,
  ExternalLink,
  HardDrive,
  Loader2,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api, type BotSnapshot } from "../lib/api";
import { subscribeJobEvents } from "../lib/realtime";
import { AuthGate, useAuthUser } from "../components/AuthGate";
import { AppShell } from "../components/AppShell";
import StatusTag from "../components/StatusTag";
import NotificationSetup from "../components/NotificationSetup";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { formatBakuDateTime, formatBotSummaryLineAz } from "../lib/locale";
import { useMinimumSkeleton } from "../lib/useMinimumSkeleton";
import { meetCodeFromUrl } from "../lib/meet-url";
import { Input } from "../components/ui/Input";
import { driveFolderWebLink, getVideoLinks } from "../lib/recording-links";

const PAGE_SIZE = 20;

type StatusFilter = "all" | "running" | "completed" | "stopped" | "failed";

function matchesStatusFilter(b: BotSnapshot, f: StatusFilter): boolean {
  if (f === "all") return true;
  const norm = b.status.toLowerCase();
  if (f === "failed") return norm === "failed";
  if (f === "completed") return norm === "completed" && !b.result?.cancelled;
  if (f === "stopped") return norm === "completed" && Boolean(b.result?.cancelled);
  return !["completed", "failed"].includes(norm);
}

function DashboardInner() {
  const [bots, setBots] = useState<BotSnapshot[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterBotId, setFilterBotId] = useState("");
  const [filterMeetId, setFilterMeetId] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const router = useRouter();
  const user = useAuthUser();

  const loadInitial = useCallback(async () => {
    setBots(null);
    try {
      const res = await api.listBots({ limit: PAGE_SIZE, offset: 0 });
      setBots(res.bots);
      setTotal(res.total);
    } catch (err) {
      setBots([]);
      setTotal(0);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  /** Realtime patches mutate visible rows in-place so we don't fetch again. */
  useEffect(() => {
    if (user.demo) return;
    const unsub = subscribeJobEvents((evt) => {
      if (evt.kind === "notification") return;
      setBots((prev) => {
        if (!prev) return prev;
        return prev.map((b) =>
          b.bot_id === evt.botId
            ? evt.kind === "failed"
              ? { ...b, status: "failed", failed_reason: evt.reason, finished_on_ms: evt.t }
              : evt.kind === "completed"
                ? { ...b, status: "completed", result: evt.result, finished_on_ms: evt.t }
                : evt.kind === "progress"
                  ? {
                      ...b,
                      progress_step: evt.step,
                      times_in_meet: Math.max(b.times_in_meet, evt.timesInMeet),
                    }
                  : { ...b, status: evt.state }
            : b
        );
      });
    });
    return () => unsub();
  }, []);

  /**
   * Append the next page. Refuses to fire when (a) we don't have an initial
   * page yet, (b) a fetch is already in flight, or (c) we already have all
   * rows. The button is disabled in those cases too — this is just defense
   * in depth.
   */
  const loadMore = useCallback(async () => {
    if (!bots || loadingMore) return;
    if (bots.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await api.listBots({ limit: PAGE_SIZE, offset: bots.length });
      /** Dedupe in case a realtime patch already showed an evicted job. */
      setBots((prev) => {
        if (!prev) return res.bots;
        const seen = new Set(prev.map((b) => b.bot_id));
        return [...prev, ...res.bots.filter((b) => !seen.has(b.bot_id))];
      });
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [bots, loadingMore, total]);

  const hasMore = bots !== null && bots.length < total;
  const listLoading = bots === null;
  const showListSkeleton = useMinimumSkeleton(listLoading, 420);

  const filteredBots = useMemo(() => {
    if (!bots) return null;
    let list = bots;
    const bid = filterBotId.trim().toLowerCase();
    if (bid) list = list.filter((b) => b.bot_id.toLowerCase().includes(bid));
    const mid = filterMeetId.trim().toLowerCase();
    if (mid) {
      list = list.filter((b) => {
        const code = meetCodeFromUrl(b.meeting_url);
        return (
          (code?.includes(mid) ?? false) ||
          (b.meeting_url?.toLowerCase().includes(mid) ?? false)
        );
      });
    }
    if (filterStatus !== "all") list = list.filter((b) => matchesStatusFilter(b, filterStatus));
    return list;
  }, [bots, filterBotId, filterMeetId, filterStatus]);

  const filtersActive = Boolean(
    filterBotId.trim() || filterMeetId.trim() || filterStatus !== "all"
  );

  const visibleIds = useMemo(
    () => (filteredBots ?? []).map((b) => b.bot_id),
    [filteredBots]
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await api.bulkDeleteBots(selectedIds);
      const msg =
        res.skipped_active > 0
          ? `${res.removed} silindi (${res.skipped_active} aktiv iş — əvvəl dayandırın).`
          : `${res.removed} silindi.`;
      toast.success(msg);
      setBots((prev) =>
        prev ? prev.filter((b) => !selectedIds.includes(b.bot_id)) : prev
      );
      setTotal((t) => Math.max(0, t - res.removed));
      setSelectedIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recordlarım</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {bots && total > 0
              ? (() => {
                  const loaded = bots.length;
                  const hasMore = loaded < total;
                  if (filtersActive && filteredBots) {
                    return `${filteredBots.length} uyğun (yüklənmiş ${loaded} / ${total})`;
                  }
                  if (!hasMore) {
                    return `Bütün ${total} record bu səhifədə yüklənib.`;
                  }
                  return `Yüklənib: ${loaded} / ${total} — qalanı üçün aşağıdakı «Daha Çox Göstər».`;
                })()
              : "Bütün görüş recordlarınızı və onların statusunu burada izləyin."}
          </p>
        </div>
        <Button onClick={() => router.push("/new")} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Yeni record
        </Button>
      </div>

      {bots && bots.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
              <label htmlFor="filter-bot-id" className="text-xs font-medium text-muted-foreground">
                Bot ID ilə axtar
              </label>
              <Input
                id="filter-bot-id"
                value={filterBotId}
                onChange={(e) => setFilterBotId(e.target.value)}
                placeholder="məs. afdccb8d…"
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
              <label htmlFor="filter-meet-id" className="text-xs font-medium text-muted-foreground">
                Meet otaq kodu / URL parçası
              </label>
              <Input
                id="filter-meet-id"
                value={filterMeetId}
                onChange={(e) => setFilterMeetId(e.target.value)}
                placeholder="məs. shk-hfti-vhd"
                className="text-sm"
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 space-y-1 sm:w-48">
              <label htmlFor="filter-status" className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Hamısı</option>
                <option value="running">Növbədə / işləyir</option>
                <option value="completed">Tamamlandı</option>
                <option value="stopped">Dayandırıldı</option>
                <option value="failed">Uğursuz</option>
              </select>
            </div>
          </div>
          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{selectedIds.length} seçildi</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={deleteBusy}
                onClick={() => void deleteSelected()}
              >
                {deleteBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Sil
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                Seçimi təmizlə
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <NotificationSetup />

      {showListSkeleton || bots === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredBots && filteredBots.length === 0 && filtersActive ? (
        <Card className="animate-content-fade-in flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <p className="font-semibold">Filtrə uyğun record yoxdur</p>
          <p className="text-sm text-muted-foreground">
            Bot ID və ya Meet kodunu dəyişin və ya sahələri təmizləyin.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setFilterBotId("");
              setFilterMeetId("");
              setFilterStatus("all");
            }}
          >
            Filtrləri sıfırla
          </Button>
        </Card>
      ) : bots.length === 0 ? (
        <Card className="animate-content-fade-in flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Video className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold">Hələ record yoxdur</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Yeni Meet recordunuz növbəyə düşəndə burada görünəcək.
            </p>
          </div>
          <Button onClick={() => router.push("/new")} className="mt-2 gap-1.5">
            <Plus className="h-4 w-4" />
            İlk recordu yarat
          </Button>
        </Card>
      ) : (
        <div className="animate-content-fade-in flex flex-col gap-3">
          {(filteredBots ?? bots).length > 0 ? (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="h-4 w-4 rounded border-border"
                />
                Bu siyahıdakıların hamısını seç
              </label>
            </div>
          ) : null}
          {(filteredBots ?? bots).map((b) => {
            const vl = b.result ? getVideoLinks(b.bot_id, b.result) : null;
            const driveHref = vl?.driveUrl;
            const driveFolderHref =
              b.result && !driveHref ? driveFolderWebLink(b.result) : undefined;
            const spacesHref = vl?.spacesUrl;
            const checked = selectedIds.includes(b.bot_id);
            return (
              <div
                key={b.bot_id}
                className="mb-ripple-host flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--shadow-elevated)]"
              >
                <label className="flex shrink-0 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(b.bot_id)}
                    className="h-4 w-4 rounded border-border"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/bots/${b.bot_id}`}
                    className="group block outline-none active:scale-[0.997]"
                  >
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {b.bot_name || "Meet Bot"}
                          </span>
                          <StatusTag status={b.status} result={b.result} />
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {b.meeting_url}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
                        <span>{formatBotSummaryLineAz(b)}</span>
                        <span>{formatBakuDateTime(b.queued_at_ms)}</span>
                      </div>

                      <ExternalLink className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-primary sm:block" />
                    </div>
                  </Link>
                  {driveHref || driveFolderHref || spacesHref ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {driveHref ? (
                        <a
                          href={driveHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-muted/70"
                        >
                          <HardDrive className="h-3 w-3 shrink-0" />
                          Drive (video)
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : driveFolderHref ? (
                        <a
                          href={driveFolderHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-muted/70"
                        >
                          <HardDrive className="h-3 w-3 shrink-0" />
                          Drive (qovluq)
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {spacesHref ? (
                        <a
                          href={spacesHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-muted/70"
                        >
                          <Cloud className="h-3 w-3 shrink-0" />
                          S3
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {loadingMore ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : null}

          {hasMore ? (
            <div className="flex justify-center pt-2">
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
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate require>
      <AppShell>
        <DashboardInner />
      </AppShell>
    </AuthGate>
  );
}
