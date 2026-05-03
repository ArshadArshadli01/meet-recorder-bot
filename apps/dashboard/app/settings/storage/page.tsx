"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Cloud, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type ObjectStorageInfo } from "../../../lib/api";
import { AuthGate } from "../../../components/AuthGate";
import { AppShell } from "../../../components/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useMinimumSkeleton } from "../../../lib/useMinimumSkeleton";

function StorageInner() {
  const router = useRouter();
  const [info, setInfo] = useState<ObjectStorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");
  const [bucket, setBucket] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getObjectStorage();
        if (cancelled) return;
        setInfo(data);
        if (data.configured) {
          setEndpoint(data.endpoint);
          setRegion(data.region);
          setBucket(data.bucket);
          setPublicBaseUrl(data.public_base_url);
          setAccessKeyId("");
          setSecretAccessKey("");
        } else if (data.save_disabled) {
          setEndpoint("");
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (saving) return;
    if (formLocked) return;
    if (info && !info.configured && (!accessKeyId.trim() || !secretAccessKey.trim())) {
      toast.error("İlk saxlanışda access key ID və secret access key məcburidir.");
      return;
    }
    setSaving(true);
    try {
      await api.putObjectStorage({
        access_key_id: accessKeyId.trim() || undefined,
        secret_access_key: secretAccessKey.trim() || undefined,
        endpoint: endpoint.trim(),
        region: region.trim(),
        bucket: bucket.trim(),
        public_base_url: publicBaseUrl.trim(),
      });
      toast.success("S3 parametrləri saxlanıldı (şifrələnmiş).");
      const data = await api.getObjectStorage();
      setInfo(data);
      setAccessKeyId("");
      setSecretAccessKey("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;
    if (!confirm("Öz bulud tənzimləmələrinizi silmək istədiyinizə əminsiniz?")) return;
    setSaving(true);
    try {
      await api.deleteObjectStorage();
      toast.success("Silindi.");
      setInfo({ configured: false });
      setAccessKeyId("");
      setSecretAccessKey("");
      setEndpoint("");
      setRegion("");
      setBucket("");
      setPublicBaseUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const formLocked = Boolean(info && !info.configured && info.save_disabled);
  const showFormSkeleton = useMinimumSkeleton(loading, 400);

  const maskedHint =
    info?.configured === true ? (
      <p className="text-xs text-muted-foreground">
        Saxlanıb: Access key{" "}
        <span className="font-mono">{info.access_key_id_masked}</span>. Yeni açar üçün sahələri
        doldurun; secret boş buraxılsa köhnə saxlanılır.
      </p>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-2xl">
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
        <h1 className="text-2xl font-bold tracking-tight">Object storage (S3)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Öz S3 uyğun buludunuzu (məs. DigitalOcean Spaces, AWS, MinIO) əlavə edin. Məlumatlar
          serverdə{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DATA_ENC_KEY</code> ilə
          şifrələnir; yalnız daxil olmuş hesabınız bu səhifədən idarə edə bilər.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cloud className="h-4 w-4" />
            </span>
            Əlavə edilmiş konteyner
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showFormSkeleton ? (
            <div className="flex flex-col gap-4" aria-busy aria-label="Yüklənir">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Skeleton className="h-10 w-24 rounded-lg" />
                <Skeleton className="h-10 w-28 rounded-lg" />
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="animate-content-fade-in flex flex-col gap-4">
              {info && !info.configured && info.save_disabled ? (
                <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  Serverdə <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DATA_ENC_KEY</code>{" "}
                  təyin edilməyib — şifrəli saxlama mümkün deyil. Əsas API konteynerində eyni açarı
                  təyin edin və yenidən yoxlayın.
                </p>
              ) : null}
              {maskedHint}

              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint URL</Label>
                <Input
                  id="endpoint"
                  placeholder="https://fra1.digitaloceanspaces.com"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  required
                  autoComplete="off"
                  disabled={formLocked}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    placeholder="fra1"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    required
                    autoComplete="off"
                    disabled={formLocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bucket">Bucket</Label>
                  <Input
                    id="bucket"
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    required
                    autoComplete="off"
                    disabled={formLocked}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-url">İctimai baza URL</Label>
                <Input
                  id="public-url"
                  placeholder="https://bucket.fra1.digitaloceanspaces.com"
                  value={publicBaseUrl}
                  onChange={(e) => setPublicBaseUrl(e.target.value)}
                  required
                  autoComplete="off"
                  disabled={formLocked}
                />
                <p className="text-xs text-muted-foreground">
                  Fayl linklərinin ön izləmə üçün istifadə olunan HTTPS baza ünvanı (sonda / olmadan).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-key">Access key ID</Label>
                <Input
                  id="access-key"
                  placeholder={info?.configured ? "(dəyişmədən saxla — boş buraxın)" : ""}
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  autoComplete="off"
                  disabled={formLocked}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secret-key">Secret access key</Label>
                <Input
                  id="secret-key"
                  type="password"
                  placeholder={info?.configured ? "(dəyişmədən saxla — boş buraxın)" : ""}
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  autoComplete="new-password"
                  disabled={formLocked}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {info?.configured ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={saving || formLocked}
                    onClick={() => void remove()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Sil
                  </Button>
                ) : null}
                <Button type="submit" disabled={saving || formLocked}>
                  {saving ? "Saxlanılır…" : "Saxla"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function StorageSettingsPage() {
  return (
    <AuthGate require>
      <AppShell>
        <StorageInner />
      </AppShell>
    </AuthGate>
  );
}
