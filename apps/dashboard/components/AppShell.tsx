"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Menu } from "lucide-react";
import {
  api,
  NOTIFICATIONS_CHANGED_EVENT,
  type AuthUser,
} from "../lib/api";
import { subscribeJobEvents } from "../lib/realtime";
import { useAuth } from "./AuthGate";
import { SideNav } from "./SideNav";
import { MobileDrawer } from "./MobileDrawer";
import { MobileBottomNav } from "./MobileBottomNav";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { DemoBanner } from "./DemoBanner";
import { WelcomeModal } from "./WelcomeModal";
import { Skeleton } from "./ui/Skeleton";
import { cn } from "../lib/utils";
import { useMinimumSkeleton } from "../lib/useMinimumSkeleton";

const POLL_MS = 60_000;

function initials(name?: string, email?: string): string {
  const t = (name || email || "?").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function MobileTopBar({
  user,
  onOpenDrawer,
}: {
  user: AuthUser;
  onOpenDrawer: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LayoutDashboard className="h-4 w-4" />
        </div>
        <span className="text-base font-bold tracking-tight">Meet Bot</span>
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Hesab menyusu"
          className="relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-primary">
                {initials(user.name, user.email)}
              </span>
            )}
          </span>
        </button>
      </div>
    </header>
  );
}

function DesktopTopBar({ user }: { user: AuthUser }) {
  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-background/85 px-6 backdrop-blur lg:flex">
      <div className="text-sm text-muted-foreground">
        Bütün tarix və vaxtlar Asia/Baku saat qurşağındadır.
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
        <span className="ml-2 hidden text-sm text-muted-foreground sm:inline">
          {user.name || user.email}
        </span>
      </div>
    </header>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 lg:flex-row">
      <Skeleton className="hidden h-screen w-64 lg:block" />
      <main className="flex-1 space-y-4 p-2 lg:p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const authLoading = auth.status === "loading";
  const showAuthShell = useMinimumSkeleton(authLoading, 400);

  const authedUserId = auth.status === "authenticated" ? auth.user.id : null;
  const isDemoUser = auth.status === "authenticated" && auth.user.demo;

  useEffect(() => {
    if (!authedUserId || isDemoUser) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.unreadNotifications();
        if (!cancelled) setUnread(res.count);
      } catch {
        /* ignore */
      }
    };
    void refresh();
    const id = window.setInterval(refresh, POLL_MS);
    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    const unsub = subscribeJobEvents((evt) => {
      if (evt.kind === "notification" || evt.kind === "completed" || evt.kind === "failed") {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      unsub();
    };
  }, [authedUserId, isDemoUser]);

  if (authLoading || showAuthShell) return <ShellSkeleton />;
  if (auth.status !== "authenticated") return <ShellSkeleton />;

  const { user } = auth;

  return (
    <div className={cn("min-h-screen pb-[88px] lg:pb-0", "lg:pl-64")}>
      <SideNav
        user={user}
        unread={unread}
        onLogout={() => router.push("/login")}
      />
      <MobileTopBar user={user} onOpenDrawer={() => setDrawerOpen(true)} />
      <DesktopTopBar user={user} />

      <DemoBanner />
      <WelcomeModal />

      <main className="px-4 py-4 lg:px-8 lg:py-8">{children}</main>

      <MobileDrawer
        open={drawerOpen}
        user={user}
        unread={unread}
        onClose={() => setDrawerOpen(false)}
        onLoggedOut={() => {
          setDrawerOpen(false);
          router.push("/login");
        }}
      />
      <MobileBottomNav
        drawerOpen={drawerOpen}
        unread={unread}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <footer className="mt-auto hidden border-t border-border/40 py-4 lg:block">
        <div className="flex justify-center gap-6 text-[11px] text-muted-foreground/50">
          <Link href="/privacy" className="hover:text-primary transition-colors">Gizlilik siyasəti</Link>
          <Link href="/terms" className="hover:text-primary transition-colors">İstifadə şərtləri</Link>
          <span>© {new Date().getFullYear()} Meet Bot</span>
        </div>
      </footer>
    </div>
  );
}
