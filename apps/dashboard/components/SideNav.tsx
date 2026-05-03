"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Cloud,
  LayoutDashboard,
  LogOut,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { api, type AuthUser } from "../lib/api";
import { cn } from "../lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name?: string, email?: string): string {
  const t = (name || email || "?").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export function SideNav({
  user,
  unread,
  onLogout,
}: {
  user: AuthUser;
  unread: number;
  onLogout: () => void;
}) {
  const pathname = usePathname() ?? "/";

  const links: NavLink[] = [
    { href: "/", label: "Panel", icon: LayoutDashboard },
    { href: "/new", label: "Yeni record", icon: Plus },
    ...(user.demo ? [] : [{ href: "/settings/storage", label: "S3 / Bulud", icon: Cloud }]),
    {
      href: "/notifications",
      label: "Bildirişlər",
      icon: Bell,
      badge:
        unread > 0 ? (
          <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null,
    },
  ];

  return (
    <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-card/60 lg:backdrop-blur">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LayoutDashboard className="h-4 w-4" />
        </div>
        <Link href="/" className="text-base font-bold tracking-tight">
          Meet Bot
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-3">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {initials(user.name, user.email)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">
                {user.name || "Hesab"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.email}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          <p className="mb-1 px-3 pt-1 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Naviqasiya
          </p>
          {links.map((l) => {
            const Icon = l.icon;
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/85 hover:bg-muted/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">{l.label}</span>
                {l.badge ?? <ChevronRight className="h-4 w-4 opacity-30" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => {
              void api.logout().catch(() => {});
              onLogout();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <LogOut className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">Çıxış</span>
          </button>
        </div>

        <div className="px-3 pb-2 text-[10px] text-muted-foreground/60 flex gap-3">
          <Link href="/privacy" className="hover:text-primary transition-colors">
            Gizlilik
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-primary transition-colors">
            Şərtlər
          </Link>
        </div>
      </div>
    </aside>
  );
}
