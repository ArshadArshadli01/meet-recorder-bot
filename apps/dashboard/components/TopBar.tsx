"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export default function TopBar({
  user,
}: {
  user: { id: string; email: string; name?: string; picture?: string };
}) {
  const router = useRouter();
  return (
    <div className="topbar">
      <div className="topbar-left">
        <Link href="/">Meet Bot</Link>
        <Link href="/" className="muted">
          Panel
        </Link>
        <Link href="/new" className="muted">
          Yeni record
        </Link>
      </div>
      <div className="topbar-right">
        {user.picture ? <div className="avatar" style={{ backgroundImage: `url(${user.picture})` }} /> : null}
        <span className="muted">{user.name || user.email}</span>
        <button
          className="btn-ghost"
          onClick={async () => {
            await api.logout().catch(() => {});
            router.push("/login");
          }}
        >
          Çıxış
        </button>
      </div>
    </div>
  );
}
