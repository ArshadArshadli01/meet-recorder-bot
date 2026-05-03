"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  Plus,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./ThemeToggle";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  active,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  href?: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        {badge && badge > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 w-full px-0.5 text-center text-[10px] font-medium leading-[1.15] tracking-tight">
        {label}
      </span>
    </>
  );
  const baseClass = cn(
    "group flex w-full min-w-0 flex-col items-center justify-end gap-1 rounded-xl px-0.5 pb-1.5 pt-2 transition-colors",
    active ? "text-primary" : "text-muted-foreground"
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={baseClass}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      className={baseClass}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}

export function MobileBottomNav({
  drawerOpen,
  unread,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  unread: number;
  onOpenDrawer: () => void;
}) {
  const pathname = usePathname() ?? "/";
  if (drawerOpen) return null;

  const homeActive = isActive(pathname, "/");
  const newActive = isActive(pathname, "/new");
  const notifActive = isActive(pathname, "/notifications");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Əsas naviqasiya"
    >
      <div className="relative mx-auto grid max-w-lg grid-cols-5 items-end gap-0 px-0.5 pt-1">
        <NavItem href="/" active={homeActive} icon={LayoutDashboard} label="Panel" />
        <NavItem
          href="/notifications"
          active={notifActive}
          icon={Bell}
          label="Bildirişlər"
          badge={unread}
        />

        <div className="flex flex-col items-center justify-end gap-1 px-0.5 pb-1.5">
          <Link
            href="/new"
            aria-label="Yeni record"
            className={cn(
              "relative z-10 -mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95",
              newActive && "ring-primary/40"
            )}
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
          <span
            className={cn(
              "max-w-full px-0.5 text-center text-[10px] font-medium leading-[1.15] tracking-tight",
              newActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            Yeni record
          </span>
        </div>

        <div className="flex flex-col items-center justify-end gap-1 pb-1.5 pt-2">
          <ThemeToggle />
          <span className="line-clamp-2 w-full px-0.5 text-center text-[10px] font-medium leading-[1.15] tracking-tight text-muted-foreground">
            Mövzu
          </span>
        </div>

        <NavItem
          active={false}
          icon={UserCircle}
          label="Profil"
          onClick={onOpenDrawer}
        />
      </div>
    </nav>
  );
}
