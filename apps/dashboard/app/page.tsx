"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  Cloud,
  ExternalLink,
  HardDrive,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api, type BotSnapshot } from "../lib/api";
import { subscribeJobEvents } from "../lib/realtime";
import { useAuth, AuthGate, useAuthUser } from "../components/AuthGate";
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
import { ThemeToggle } from "../components/ThemeToggle";

/* ─────────────────────────────────────────────────────────────────────────
 *  PUBLIC LANDING PAGE
 *  Shown to unauthenticated visitors (including Google's verification
 *  crawler). Contains a clear app description + prominent Privacy Policy
 *  and Terms of Service links — exactly what Google requires.
 * ───────────────────────────────────────────────────────────────────────── */

function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ─── Top bar ─── */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-bold tracking-tight">Meet Bot</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            Daxil ol
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Video className="h-8 w-8" />
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Meet Recorder Bot
          </h1>

          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Google Meet görüşlərinizi təhlükəsiz və öz serverinizdə yerləşən bot ilə avtomatlaşdırın.
            Meet Bot görüşlərinizə qoşulur, səs və videonu yazır, Google Diskə yükləyir və real vaxt rejimində status yeniləmələrini təqdim edir — beləliklə, siz diqqətinizi söhbətə cəmləyə bilərsiniz.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition hover:brightness-110"
            >
              Başlayın
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/ArshadArshadli01/meet-recorder-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-6 text-sm font-semibold transition hover:bg-muted"
            >
              GitHub-da baxın
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* Feature highlights */}
          <div className="mt-14 grid gap-6 text-left sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
              <Video className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-semibold">Avtomatik Yazma</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Bot Google Meet görüşünüzə qoşulur, səs və videonu avtomatik yazır və görüş bitdikdə faylı saxlayır.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
              <HardDrive className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-semibold">Bulud Yükləmə</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Yazılar bir kliklə Google Diskə və ya S3 uyğun yaddaşa yüklənir.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
              <ShieldCheck className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-semibold">Təhlükəsiz və Özəl Yerləşdirmə</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Açıq mənbəli və öz serverinizdə — məlumatlarınız öz serverlərinizdə qalır. OAuth tokenləri şifrələnmiş şəkildə saxlanılır.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Footer with Privacy Policy + Terms (visible to crawlers) ─── */}
      <footer className="border-t border-border/40 px-6 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Arshadli. Bütün hüquqlar qorunur.</p>
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <a
            href="/privacy-policy"
            className="font-medium underline underline-offset-4 transition-colors hover:text-primary"
          >
            Məxfilik Siyasəti
          </a>
          <a
            href="/terms"
            className="font-medium underline underline-offset-4 transition-colors hover:text-primary"
          >
            İstifadə Şərtləri
          </a>
          <a
            href="https://github.com/ArshadArshadli01/meet-recorder-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-primary"
          >
            GitHub
          </a>
        </nav>
        <p className="mt-4 text-xs text-muted-foreground/60 max-w-2xl mx-auto leading-relaxed">
          Meet Bot-un Google API-lərdən alınan məlumatlardan istifadəsi və ötürülməsi,{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-primary"
          >
            Google API Xidmətləri İstifadəçi Məlumatı Siyasətinə
          </a>
          , o cümlədən Məhdud İstifadə (Limited Use) tələblərinə uyğundur.
        </p>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 *  AUTHENTICATED DASHBOARD
 *  The existing dashboard (unchanged) — shown only to logged-in users.
 * ───────────────────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────────────────
 *  PAGE ROUTER
 *  Shows the landing page OR the dashboard based on auth status.
 *  The AuthGate wrapper tries /auth/me; if anonymous it shows the
 *  public landing page instead of redirecting to /login.
 * ───────────────────────────────────────────────────────────────────────── */

function PageRouter() {
  const auth = useAuth();

  // Still loading auth state — show nothing (layout footer is always visible)
  if (auth.status === "loading") return null;

  // Not logged in — show the public landing page
  if (auth.status === "anonymous") return <LandingPage />;

  // Logged in — show the dashboard
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <PageRouter />
    </AuthGate>
  );
}
