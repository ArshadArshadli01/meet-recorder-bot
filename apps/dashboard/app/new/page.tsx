"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderUp,
  Sparkles,
  Cloud,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, type ObjectStorageInfo } from "../../lib/api";
import { cn } from "../../lib/utils";
import { AuthGate } from "../../components/AuthGate";
import { AppShell } from "../../components/AppShell";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Switch } from "../../components/ui/Switch";
import { Badge } from "../../components/ui/Badge";

function NewInner() {
  const router = useRouter();
  const [meetingUrl, setMeetingUrl] = useState("");
  const [botName, setBotName] = useState("Meet Bot");
  const [saveToDrive, setSaveToDrive] = useState(false);
  const [saveToSpaces, setSaveToSpaces] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageInfo, setStorageInfo] = useState<ObjectStorageInfo | null>(null);
  const [defaultsHydrated, setDefaultsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .getObjectStorage()
      .then((info) => {
        if (cancelled) return;
        setStorageInfo(info);
        if (!info.configured) setSaveToSpaces(false);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageInfo(null);
          setSaveToSpaces(false);
        }
      })
      .finally(() => {
        if (!cancelled) setStorageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .getRecordFormDefaults()
      .then((row) => {
        if (cancelled || !row) {
          setDefaultsHydrated(true);
          return;
        }
        setMeetingUrl(row.meeting_url ?? "");
        setBotName(row.bot_name);
        setSaveToDrive(row.save_to_drive);
        setDriveFolderId(row.drive_folder_id ?? "");
        if (row.save_to_spaces) setSaveToSpaces(true);
        setDefaultsHydrated(true);
      })
      .catch(() => {
        setDefaultsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!defaultsHydrated || storageLoading) return;
    if (storageInfo && !storageInfo.configured) setSaveToSpaces(false);
  }, [defaultsHydrated, storageLoading, storageInfo]);

  const s3CredentialsReady = storageInfo?.configured === true;
  const s3SwitchDisabled = storageLoading || !s3CredentialsReady;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.createBot({
        meeting_url: meetingUrl,
        bot_name: botName,
        save_to_drive: saveToDrive,
        save_to_spaces: saveToSpaces,
        drive_folder_id: driveFolderId || undefined,
      });
      toast.success("Record növbəyə alındı.");
      router.push(`/bots/${created.bot_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Geri
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Yeni record</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Görüş linkini daxil edin, bot adını seçin və yadda saxlama variantlarını seçin.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="overflow-hidden">
          <form onSubmit={submit} className="flex flex-col gap-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="meet-url">Görüş URL-i</Label>
              <Input
                id="meet-url"
                placeholder="https://meet.google.com/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-name">Bot adı</Label>
              <Input
                id="bot-name"
                placeholder="Məs: Meet Bot"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSaveToDrive((v) => !v)}
                className="mb-ripple-host flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-left transition-[background-color,border-color] duration-150 hover:border-primary/30 hover:bg-muted/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderUp className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Google Drive</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Recordlar Google Drive hesabınızda saxlanacaq.
                  </span>
                </span>
                <Switch
                  checked={saveToDrive}
                  onCheckedChange={setSaveToDrive}
                  ariaLabel="Drive-a yadda saxla"
                />
              </button>

              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-left transition-[background-color,border-color] duration-150",
                  s3SwitchDisabled
                    ? "cursor-not-allowed opacity-80"
                    : "cursor-pointer hover:border-primary/30 hover:bg-muted/50"
                )}
                role="presentation"
                onClick={() => {
                  if (!s3SwitchDisabled) setSaveToSpaces((v) => !v);
                }}
                onKeyDown={(e) => {
                  if (s3SwitchDisabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSaveToSpaces((v) => !v);
                  }
                }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  <Cloud className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    Object storage (S3)
                    {storageLoading ? (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                        …
                      </Badge>
                    ) : s3CredentialsReady ? (
                      <Badge variant="success" className="h-5 px-1.5 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" />
                        Hazır
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                        Əlavə edilməyib
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {storageLoading ? (
                      "Bulud tənzimləmələri yoxlanır…"
                    ) : s3CredentialsReady ? (
                      "Recordlar S3 uyğun buludunuza yüklənəcək — keçidi söndürə bilərsiniz."
                    ) : (
                      <>
                        Öz bucket üçün əvvəl{" "}
                        <Link
                          href="/settings/storage"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          S3 tənzimləmələri
                        </Link>{" "}
                        əlavə edin; keçid aktiv olmayana qədər söndürülüb qalır.
                      </>
                    )}
                  </span>
                </span>
                <span
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={s3CredentialsReady && saveToSpaces}
                    onCheckedChange={(next) => {
                      if (!s3CredentialsReady) return;
                      setSaveToSpaces(next);
                    }}
                    disabled={s3SwitchDisabled}
                    ariaLabel="Object storage-a yüklə"
                  />
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-folder">Bulud qovluğu — Drive və S3 (istəyə bağlı)</Label>
              <Input
                id="drive-folder"
                placeholder="Drive qovluq ID və ya yeni qovluq adı (məs: Meet Records)"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                disabled={!saveToDrive && !saveToSpaces}
              />
              <p className="text-xs text-muted-foreground">
                Google Drive-da bu qovluğa yüklənir; S3 faylları da eyni məntiqi qovluq altında
                saxlanır. Ad yazsanız və ya köhnə ID işləmirsə, server təhlükəsiz şəkildə yeni qovluq
                yarada bilər. Boşsə — Drive kökü; S3-də hər bot üçün ayrıca meet-recordings prefiksi.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => router.push("/")}>
                İmtina
              </Button>
              <Button type="submit" disabled={busy} className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                {busy ? "Göndərilir..." : "Recordu başlat"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Status nümunələri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Badge variant="warning" className="mt-0.5">
                <Clock className="h-3 w-3" />
                Növbədə
              </Badge>
              <span className="text-muted-foreground">Bot sırada gözləyir.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="default" className="mt-0.5">
                <Activity className="h-3 w-3" />
                Aktiv
              </Badge>
              <span className="text-muted-foreground">Bot görüşdədir, record aparılır.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="success" className="mt-0.5">
                <CheckCircle2 className="h-3 w-3" />
                Tamamlandı
              </Badge>
              <span className="text-muted-foreground">
                Fayl uğurla hazırlandı və yükləndi.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="danger" className="mt-0.5">
                <AlertTriangle className="h-3 w-3" />
                Uğursuz
              </Badge>
              <span className="text-muted-foreground">
                Record səhifəsində səhv detallarına baxın.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function NewPage() {
  return (
    <AuthGate require>
      <AppShell>
        <NewInner />
      </AppShell>
    </AuthGate>
  );
}
