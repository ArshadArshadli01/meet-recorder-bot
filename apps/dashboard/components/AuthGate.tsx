"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, type AuthMe, type AuthUser } from "../lib/api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthUser };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useAuthUser(): AuthUser {
  const ctx = useContext(AuthContext);
  if (ctx.status !== "authenticated") {
    throw new Error(
      "useAuthUser called outside of an authenticated tree — wrap with <AuthGate require>"
    );
  }
  return ctx.user;
}

/**
 * Provider that fetches `/auth/me` once on mount. Pages can either consume
 * the context directly (`useAuth`) or pass `require` to redirect to /login
 * when the user is anonymous (used by every protected page).
 */
export function AuthGate({
  children,
  require = false,
}: {
  children: ReactNode;
  require?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const me: AuthMe = await api.me();
        if (cancelled) return;
        if (me.authenticated) setState({ status: "authenticated", user: me.user });
        else setState({ status: "anonymous" });
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!require || state.status !== "anonymous") return;
    const target = pathname && pathname !== "/login" ? pathname : "/";
    router.push(`/login?return=${encodeURIComponent(target)}`);
  }, [require, state.status, pathname, router]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
