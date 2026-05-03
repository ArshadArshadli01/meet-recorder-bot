"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";
import { api, loginUrl } from "../../lib/api";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button } from "../../components/ui/Button";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params?.get("return") || "/";
  const [demoMode, setDemoMode] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.authStatus().then((s) => {
      if (!cancelled) {
        setDemoMode(!!s.appDemoMode);
        setStatusLoading(false);
      }
    });

    void api
      .me()
      .then((me) => {
        if (!cancelled && me.authenticated) router.replace(returnTo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router, returnTo]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/85 p-8 text-center shadow-[var(--shadow-elevated)] backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <LayoutDashboard className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Meet Bot Panel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Görüş recordlarınızı təhlükəsiz idarə etmək üçün Google hesabı ilə daxil olun.
        </p>

        {statusLoading ? (
          <div className="mt-8 flex justify-center py-2">
             <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : demoMode ? (
          <Button
            onClick={() => router.replace(returnTo)}
            className="mt-6 w-full gap-2"
            size="lg"
          >
            <Sparkles className="h-4 w-4" />
            Demo girişi (Login-siz keçin)
          </Button>
        ) : (
          <a
            href={loginUrl(returnTo)}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-800 shadow ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5 12.4 4.5 3 13.9 3 25.5S12.4 46.5 24 46.5 45 37.1 45 25.5c0-1.7-.2-3.4-.4-5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.9 15.7 19.1 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5c-7.5 0-13.9 4.1-17.7 10.2z"
              />
              <path
                fill="#4CAF50"
                d="M24 46.5c5.2 0 9.8-2 13.4-5.2l-6.2-5.1c-2 1.4-4.6 2.3-7.2 2.3-5.2 0-9.6-3.4-11.2-8L6.3 35.3C9.9 41.6 16.4 46.5 24 46.5z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.1C40.6 35.4 45 30.5 45 25.5c0-1.7-.2-3.4-.4-5z"
              />
            </svg>
            Google ilə davam et
          </a>
        )}

        <ul className="mt-6 space-y-2 text-left text-sm">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span className="text-muted-foreground">
              Refresh token-ləriniz şifrələnərək saxlanılır.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Real-vaxt status, push bildirişləri və Drive avtomatik yüklənmə.
            </span>
          </li>
        </ul>

        <div className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground/60">
          <a href="/privacy" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            Gizlilik siyasəti
          </a>
          <span>•</span>
          <a href="/terms" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            İstifadə şərtləri
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Yüklənir...</div>}>
      <LoginInner />
    </Suspense>
  );
}
