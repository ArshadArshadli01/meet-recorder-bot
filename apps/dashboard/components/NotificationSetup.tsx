"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { getBrowserPushToken } from "../lib/firebase";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../lib/utils";

const STORAGE_KEY = "meet-bot:push-enabled";

export default function NotificationSetup() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  async function enableNotifications() {
    setBusy(true);
    try {
      const token = await getBrowserPushToken();
      if (!token) {
        toast.error("Brauzer bildiriş icazəsi vermədi və ya dəstəkləmir.");
        return;
      }
      await api.registerPushToken(token);
      window.localStorage.setItem(STORAGE_KEY, "1");
      setEnabled(true);
      toast.success("Brauzer push bildirişləri aktivdir.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4",
        enabled && "border-success/30 bg-success/5"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            enabled ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
          )}
        >
          {enabled ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {enabled ? "Push bildirişləri aktivdir" : "Push bildirişlərini aktiv et"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? "Növbə, başladı, tamamlandı və uğursuz hadisələr bu cihazınıza göndəriləcək."
              : "Görüş recordları tamamlananda və ya uğursuz olanda dərhal xəbər tutun."}
          </p>
        </div>
      </div>
      <Button
        onClick={enableNotifications}
        disabled={busy}
        variant={enabled ? "outline" : "default"}
        size="sm"
      >
        {busy ? "Aktiv edilir..." : enabled ? "Yenidən sinxronlaşdır" : "Aktiv et"}
      </Button>
    </Card>
  );
}
