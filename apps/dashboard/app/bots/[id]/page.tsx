"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  StopCircle,
  AlertTriangle,
  Cloud,
  HardDriveDownload,
  FileText,
  MessageSquare,
  Film,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type AppConfig, type BotSnapshot } from "../../../lib/api";
import { subscribeJobEvents } from "../../../lib/realtime";
import { AuthGate, useAuthUser } from "../../../components/AuthGate";
import { AppShell } from "../../../components/AppShell";
import StatusTag from "../../../components/StatusTag";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Skeleton } from "../../../components/ui/Skeleton";
import { formatBakuDateTime, formatBotSummaryLineAz } from "../../../lib/locale";
import {
  driveFolderWebLink,
  getVideoLinks,
  googleDriveFileViewUrl,
} from "../../../lib/recording-links";
function copy(text: string, label: string) {
  if (!navigator.clipboard) {
    toast.error("Brauzer kopyalamağı dəstəkləmir.");
    return;
  }
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} kopyalandı.`),
    () => toast.error("Kopyalamaq mümkün olmadı.")
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border/60 px-5 py-3 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs sm:text-sm break-all" : "text-sm"}>
        {value}
      </div>
    </div>
  );
}

function BotDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [bot, setBot] = useState<BotSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const user = useAuthUser();

  const videoLinks = useMemo(
    () => (bot?.result ? getVideoLinks(bot.bot_id, bot.result) : null),
    [bot]
  );

  const driveQuickFolderHref = useMemo(() => {
    if (!bot?.result) return undefined;
    const folder = driveFolderWebLink(bot.result);
    if (folder) return folder;
    if (bot.result.drive_file_id) return googleDriveFileViewUrl(bot.result.drive_file_id);
    return undefined;
  }, [bot]);

  /**
   * Drive və ya Spaces keçidləri API-dən gecikə bilər — bu müddətdə preloader göstərilir.
   * Qovluq keçidi (`drive_folder_url` və s.) varsa, Drive üçün gözləmə bitmiş sayılır.
   *
   * Dayandırılmış işlər (`cancelled`): worker buluda yükləməni ötürür — gözləmə göstərmə.
   */
  const cloudUploadState = useMemo(() => {
    if (!bot?.result || bot.status.toLowerCase() !== "completed") {
      return { pending: false, driveLine: false, spacesLine: false };
    }
    const note = bot.result.note ?? "";
    const cancelledRun =
      bot.result.cancelled === true || /\bcancelled by user request\b/i.test(note);
    if (cancelledRun) {
      return { pending: false, driveLine: false, spacesLine: false };
    }
    const vl = getVideoLinks(bot.bot_id, bot.result);
    const wantDrive = bot.save_to_drive !== false && !bot.result.drive_error;
    const wantSpaces =
      bot.save_to_spaces === true &&
      (appConfig?.spaces_enabled ?? true) &&
      !bot.result.spaces_error;
    const driveResolved =
      Boolean(vl.driveUrl) || Boolean(driveFolderWebLink(bot.result));
    const driveLine = wantDrive && !driveResolved;
    const spacesLine = wantSpaces && !vl.spacesUrl;
    return {
      pending: driveLine || spacesLine,
      driveLine,
      spacesLine,
    };
  }, [bot, appConfig]);

  /** Tamamlandıqdan sonra Drive/S3 sahələri bəzən bir neçə saniyə gec doldurulur — yenilə. */
  useEffect(() => {
    if (!id || !cloudUploadState.pending) return;
    const interval = window.setInterval(() => {
      void api.getBot(id).then(setBot).catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [id, cloudUploadState.pending]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void Promise.all([
      api.getBot(id),
      api.config().catch(() => null as AppConfig | null),
    ])
      .then(([b, cfg]) => {
        if (cancelled) return;
        setBot(b);
        if (cfg) setAppConfig(cfg);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          toast.error(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Tam nəticə (çat, şəkillər) bəzən bir qədər gec gəlir — pəncərə fokusunda yenilə. */
  useEffect(() => {
    if (!id) return;
    const onFocus = () => {
      void api.getBot(id).then(setBot).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [id]);

  useEffect(() => {
    if (!id || user.demo) return;
    const unsub = subscribeJobEvents((evt) => {
      if (evt.kind === "notification" || evt.botId !== id) return;
      setBot((prev) => {
        if (!prev) return prev;
        if (evt.kind === "failed")
          return { ...prev, status: "failed", failed_reason: evt.reason, finished_on_ms: evt.t };
        if (evt.kind === "completed")
          return { ...prev, status: "completed", result: evt.result, finished_on_ms: evt.t };
        if (evt.kind === "progress")
          return {
            ...prev,
            progress_step: evt.step,
            times_in_meet: Math.max(prev.times_in_meet, evt.timesInMeet),
          };
        return { ...prev, status: evt.state };
      });
    });
    return () => unsub();
  }, [id]);

  async function cancelRecording() {
    if (!id || cancelBusy) return;
    setCancelBusy(true);
    try {
      const res = await api.cancelBot(id);
      if (res.ok) {
        toast.success("Dayandırma sorğusu göndərildi.");
        setBot((prev) =>
          prev ? { ...prev, status: "delayed", progress_step: "cancellation_requested" } : prev
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <Card className="px-6 py-10">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
          <h2 className="mt-3 text-lg font-semibold">Record tapılmadı</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bu bot ID-si ilə record mövcud deyil və ya silinib.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
          >
            Geri qayıt
          </Link>
        </Card>
      </div>
    );
  }

  const canCancel = !["completed", "failed"].includes(bot.status.toLowerCase());

  return (
    <div className="animate-content-fade-in mx-auto w-full max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Panelə qayıt
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{bot.bot_name || "Meet Bot"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatBotSummaryLineAz(bot)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusTag status={bot.status} result={bot.result} />
          {canCancel ? (
            <Button
              variant="destructive"
              onClick={cancelRecording}
              disabled={cancelBusy}
              className="gap-1.5"
            >
              <StopCircle className="h-4 w-4" />
              {cancelBusy ? "Dayandırılır..." : "Dayandır"}
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        <DetailRow
          label="Bot ID"
          value={
            <button
              type="button"
              onClick={() => copy(bot.bot_id, "Bot ID")}
              className="inline-flex items-center gap-1.5 rounded-md font-mono text-xs hover:text-primary"
            >
              {bot.bot_id}
              <Copy className="h-3 w-3" />
            </button>
          }
        />
        <DetailRow
          label="Görüş URL"
          value={
            bot.meeting_url ? (
              <a
                href={bot.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline break-all"
              >
                {bot.meeting_url}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              "—"
            )
          }
          mono
        />
        <DetailRow label="Növbəyə alındı" value={formatBakuDateTime(bot.queued_at_ms)} />
        <DetailRow label="Başladı" value={formatBakuDateTime(bot.processed_on_ms)} />
        <DetailRow label="Bitdi" value={formatBakuDateTime(bot.finished_on_ms)} />
        <DetailRow
          label="Cəhdlər"
          value={`${bot.processing_attempts}${bot.attempts_limit ? ` / ${bot.attempts_limit}` : ""}`}
        />
        <DetailRow
          label="Görüşdə"
          value={
            bot.times_in_meet >= 1
              ? "Bəli (görüşə daxil olundu / record fazası)"
              : "Hələ yox (gözləyir)"
          }
        />
        {bot.failed_reason ? (
          <DetailRow
            label="Səhv"
            value={
              <span className="inline-flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{bot.failed_reason}</span>
              </span>
            }
          />
        ) : null}
      </Card>

      {bot.result ? (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-border/60 bg-muted/25 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Record məlumatları</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Serverdən gələn tam nəticə: qeyd, fayl yolu, çat və şəkillər (əgər toplanıbsa).
            </p>
          </div>
          {bot.result.note ? (
            <DetailRow
              label="Qeyd"
              value={<span className="whitespace-pre-wrap">{bot.result.note}</span>}
            />
          ) : null}
          {cloudUploadState.pending ? (
            <div className="border-b border-border/60 bg-muted/15 px-5 py-4">
              <div className="mb-3 flex items-start gap-3">
                <Loader2
                  className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary"
                  aria-hidden
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Fayl buluda yerləşdirilir
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Worker videonu Google Drive və ya S3 (Spaces)-a yükləyəndə keçidlər burada
                    görünəcək. Bu səhifəni açıq saxlayın — avtomatik yenilənir.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {cloudUploadState.driveLine ? (
                      <li className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        Google Drive — yüklənir…
                      </li>
                    ) : null}
                    {cloudUploadState.spacesLine ? (
                      <li className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        S3 / Spaces — yüklənir…
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
              <div className="space-y-2 pl-8">
                <Skeleton className="h-11 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            </div>
          ) : null}
          {videoLinks &&
          (videoLinks.driveUrl || videoLinks.spacesUrl || videoLinks.localApiHref) ? (
            <>
              {videoLinks.driveUrl ? (
                <DetailRow
                  label="Video (Google Drive)"
                  value={
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <span className="break-all font-mono text-xs text-muted-foreground">
                        {videoLinks.driveUrl}
                      </span>
                      <a
                        href={videoLinks.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
                      >
                        Google Drive-da aç
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  }
                />
              ) : null}
              {videoLinks.spacesUrl ? (
                <DetailRow
                  label="Video (object storage / S3)"
                  value={
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <span className="break-all font-mono text-xs text-muted-foreground">
                        {videoLinks.spacesUrl}
                      </span>
                      <a
                        href={videoLinks.spacesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
                      >
                        S3 / Spaces-da aç
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  }
                />
              ) : null}
              {videoLinks.localApiHref ? (
                <DetailRow
                  label={
                    videoLinks.driveUrl || videoLinks.spacesUrl
                      ? "Video (server — yerli nüsxə)"
                      : "Video (server — yerli)"
                  }
                  value={
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <span className="break-all font-mono text-xs">
                        {bot.result.relativePath ?? videoLinks.localApiHref}
                      </span>
                      <a
                        href={videoLinks.localApiHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
                      >
                        Videonu aç / yüklə
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  }
                />
              ) : null}
            </>
          ) : null}
          {bot.result.artifact_urls?.audio ? (
            <DetailRow
              label="Əlavə audio"
              value={
                <a
                  href={bot.result.artifact_urls.audio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Film className="h-3.5 w-3.5 shrink-0" />
                  Faylı aç
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
            />
          ) : null}
          {bot.result.artifact_urls?.chat_messages ? (
            <DetailRow
              label="Çat (JSONL)"
              value={
                <a
                  href={bot.result.artifact_urls.chat_messages}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  Faylı aç
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
            />
          ) : null}
          {bot.result.chat_messages && bot.result.chat_messages.length > 0 ? (
            <div className="border-t border-border/60 px-5 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                Çat mətnləri (önizləmə)
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-3 font-mono text-xs leading-relaxed">
                {bot.result.chat_messages.slice(0, 80).map((line, i) => (
                  <div key={i} className="border-b border-border/40 py-1 last:border-b-0">
                    <span className="text-muted-foreground">
                      {formatBakuDateTime(line.t)}
                    </span>{" "}
                    {line.text}
                  </div>
                ))}
                {bot.result.chat_messages.length > 80 ? (
                  <p className="mt-2 text-muted-foreground">
                    … və daha {bot.result.chat_messages.length - 80} sətir (tamı üçün JSONL faylına baxın).
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {(driveQuickFolderHref ||
        bot.result?.spaces_url ||
        bot.result?.drive_error ||
        bot.result?.spaces_error) ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {driveQuickFolderHref ? (
            <a
              href={driveQuickFolderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HardDriveDownload className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Google Drive</span>
                <span className="block text-xs text-muted-foreground">
                  {bot.result && driveFolderWebLink(bot.result)
                    ? "Qovluğu açmaq üçün toxun"
                    : "Faylı Drive-da açmaq üçün toxun"}
                </span>
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          ) : bot.result?.drive_error ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Drive yükləməsi uğursuz</div>
                <div className="mt-1 text-xs opacity-90">{bot.result.drive_error}</div>
              </div>
            </div>
          ) : null}

          {bot.result?.spaces_url ? (
            <a
              href={bot.result.spaces_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Cloud className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Spaces</span>
                <span className="block text-xs text-muted-foreground">
                  Faylı yükləmək üçün toxun
                </span>
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          ) : bot.result?.spaces_error ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Spaces yükləməsi uğursuz</div>
                <div className="mt-1 text-xs opacity-90">{bot.result.spaces_error}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function BotDetailPage() {
  return (
    <AuthGate require>
      <AppShell>
        <BotDetailInner />
      </AppShell>
    </AuthGate>
  );
}
