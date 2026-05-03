"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Cloud,
  LayoutDashboard,
  LogOut,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { api, type AuthUser } from "../lib/api";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./ThemeToggle";

type DrawerLink = { href: string; label: string; icon: LucideIcon; badge?: number };

function initials(name?: string, email?: string): string {
  const t = (name || email || "?").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkBase =
  "mx-2 flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors";

export function MobileDrawer({
  open,
  user,
  unread,
  onClose,
  onLoggedOut,
}: {
  open: boolean;
  user: AuthUser;
  unread: number;
  onClose: () => void;
  onLoggedOut: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const [closing, setClosing] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const exitFinishedRef = useRef(false);
  const drawerExitAnimatingRef = useRef(false);
  const logoutAfterCloseRef = useRef(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setClosing(false);
      exitFinishedRef.current = false;
      drawerExitAnimatingRef.current = false;
    }
  }, [open]);

  const finishClose = useCallback(() => {
    if (exitFinishedRef.current) return;
    exitFinishedRef.current = true;
    drawerExitAnimatingRef.current = false;
    setClosing(false);
    onClose();
    if (logoutAfterCloseRef.current) {
      logoutAfterCloseRef.current = false;
      void api.logout().catch(() => {});
      onLoggedOut();
    }
  }, [onClose, onLoggedOut]);

  const startClose = useCallback(() => {
    if (!open || closing) return;
    drawerExitAnimatingRef.current = true;
    setClosing(true);
  }, [open, closing]);

  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(() => finishClose(), 240);
    return () => window.clearTimeout(id);
  }, [closing, finishClose]);

  const onPanelAnimationEnd = (e: AnimationEvent<HTMLElement>) => {
    if (!drawerExitAnimatingRef.current) return;
    if (e.target !== e.currentTarget) return;
    if (typeof e.animationName === "string" && e.animationName.includes("panel-out")) {
      finishClose();
    }
  };

  const handleLogout = () => {
    logoutAfterCloseRef.current = true;
    startClose();
  };

  const links: DrawerLink[] = [
    { href: "/", label: "Panel", icon: LayoutDashboard },
    { href: "/new", label: "Yeni record", icon: Plus },
    ...(user.demo ? [] : [{ href: "/settings/storage", label: "S3 / Bulud", icon: Cloud }]),
    { href: "/notifications", label: "Bildirişlər", icon: Bell, badge: unread },
  ];

  if (!portalReady || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="Menyu"
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-black/55",
          closing ? "animate-drawer-backdrop-out" : "animate-drawer-backdrop"
        )}
        aria-label="Menyunu bağla"
        onClick={startClose}
      />
      <div className="pointer-events-none absolute inset-0 flex justify-end">
        <aside
          className={cn(
            "pointer-events-auto flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-[var(--shadow-elevated)]",
            closing ? "animate-drawer-panel-out" : "animate-drawer-panel"
          )}
          onAnimationEnd={onPanelAnimationEnd}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-border">
            <div className="flex justify-end px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
              <button
                type="button"
                onClick={startClose}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Bağla"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="px-4 pb-5">
              <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-muted/40 via-muted/20 to-transparent p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="relative h-[5rem] w-[5rem] shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border/55">
                    {user.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.picture}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-primary">
                        {initials(user.name, user.email)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold leading-tight">
                      {user.name || "Hesab"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-3">
            <p className="mb-0.5 px-5 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Naviqasiya
            </p>
            <nav className="flex flex-col gap-0.5">
              {links.map((l) => {
                const Icon = l.icon;
                const active = isActive(pathname, l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={startClose}
                    className={cn(
                      linkBase,
                      active
                        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                        : "text-foreground/90 hover:bg-muted/60"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">{l.label}</span>
                    {l.badge && l.badge > 0 ? (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary tabular-nums">
                        {l.badge > 99 ? "99+" : l.badge}
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-30" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="mx-4 my-4 border-t border-border" />
            <div className="px-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Görünüş
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Mövzu</div>
                  <div className="text-xs text-muted-foreground">
                    Açıq və qaranlıq arasında dəyiş
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border px-4 py-[max(16px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
            >
              <LogOut className="h-4 w-4" />
              Çıxış
            </button>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}
