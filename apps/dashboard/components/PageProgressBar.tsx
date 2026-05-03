"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top-of-viewport progress bar for client-side navigation, similar to
 * NProgress / YouTube. Implemented in-house so we don't pull a dependency
 * for ~80 lines of code.
 *
 * How it knows a navigation is in flight (App Router has no built-in
 * route-change events):
 *   1. We monkey-patch `history.pushState` / `history.replaceState` so any
 *      call (Next.js `router.push`, `router.replace`, anchor clicks routed
 *      through `<Link>`) flips us into the `loading` state.
 *   2. We also listen to `popstate` (browser back/forward) for the same.
 *   3. We capture clicks on internal `<a href>` elements as a belt-and-
 *      suspenders signal — `<Link>` does call pushState eventually, but the
 *      moment between click and history change is where users notice lag.
 *
 * It knows the navigation finished by watching `usePathname()` and
 * `useSearchParams()`: when either changes, we run the bar to 100% and fade
 * it out. A `MAX_LOADING_MS` safety net hides the bar if Next.js never
 * commits the navigation (e.g. a `router.refresh()` that resolves quickly).
 *
 * Visuals: 2px primary-colored bar with a soft glow, eased from 0% → 88%
 * over ~10s (so a quick navigation snaps to 100%), then a 160ms 100% +
 * fade-out tail.
 */

type Phase = "idle" | "loading" | "complete";

const MAX_LOADING_MS = 12_000;
/** Delay before showing the bar so a sub-150ms navigation doesn't flash. */
const SHOW_DELAY_MS = 80;

/** Bot detal səhifəsinə keçiddə üst zolaq göstərmə — istifadəçi orada öz skeleton gözləyir, ikiqat yüklənir kimi görünür. */
function shouldSkipProgressForHref(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    return /^\/bots\/[^/]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isInternalLinkClick(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented) return null;
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  let target = event.target as Element | null;
  while (target && target.tagName !== "A") target = target.parentElement;
  if (!target) return null;
  const a = target as HTMLAnchorElement;
  if (a.target && a.target !== "" && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;
  if (a.getAttribute("rel")?.includes("external")) return null;
  const href = a.getAttribute("href");
  if (!href) return null;
  if (href.startsWith("#")) return null;
  if (/^[a-z]+:/i.test(href) && !href.startsWith("http")) return null;
  /** Cross-origin links are real navigations; the browser shows its own progress. */
  try {
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== window.location.hash
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return a;
}

export function PageProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  /** Anchor for completion logic: only mark "complete" if a route actually changed. */
  const startedAtRef = useRef<number | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("idle");

  function clearTimers() {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    tickerRef.current = null;
    showTimerRef.current = null;
    hideTimerRef.current = null;
    safetyTimerRef.current = null;
  }

  function start() {
    if (phaseRef.current === "loading") return;
    clearTimers();
    startedAtRef.current = Date.now();
    /** Defer rendering so a fast (<80ms) navigation never flickers a 1-frame bar. */
    showTimerRef.current = setTimeout(() => {
      phaseRef.current = "loading";
      setPhase("loading");
      setProgress(8);
      /**
       * Approach toward 88% asymptotically — never reach 100% until the
       * route actually commits. The `0.4 * (88 - prev)` factor is the
       * classic NProgress-style ease.
       */
      tickerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 88) return prev;
          const step = Math.max(0.5, 0.05 * (88 - prev));
          return Math.min(88, prev + step);
        });
      }, 220);
    }, SHOW_DELAY_MS);

    safetyTimerRef.current = setTimeout(() => complete(), MAX_LOADING_MS);
  }

  function complete() {
    if (phaseRef.current === "idle" && !showTimerRef.current) return;
    if (showTimerRef.current) {
      /** Navigation finished before we even rendered — just stay idle. */
      clearTimers();
      phaseRef.current = "idle";
      setPhase("idle");
      setProgress(0);
      return;
    }
    clearTimers();
    phaseRef.current = "complete";
    setPhase("complete");
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      phaseRef.current = "idle";
      setPhase("idle");
      setProgress(0);
    }, 320);
  }

  useEffect(() => {
    /**
     * Patch history methods. We chain into the original implementations
     * before flipping into "loading" so this is transparent to Next.js.
     */
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    function patchedPush(this: History, ...args: Parameters<History["pushState"]>) {
      const url = args[2];
      if (!(typeof url === "string" && shouldSkipProgressForHref(url))) {
        start();
      }
      return origPush.apply(this, args);
    }
    function patchedReplace(this: History, ...args: Parameters<History["replaceState"]>) {
      const url = args[2];
      if (!(typeof url === "string" && shouldSkipProgressForHref(url))) {
        start();
      }
      return origReplace.apply(this, args);
    }
    window.history.pushState = patchedPush;
    window.history.replaceState = patchedReplace;

    function onPopState() {
      queueMicrotask(() => {
        if (shouldSkipProgressForHref(window.location.href)) return;
        start();
      });
    }
    function onClick(e: MouseEvent) {
      const a = isInternalLinkClick(e);
      if (!a) return;
      if (shouldSkipProgressForHref(a.href)) return;
      start();
    }

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Route committed → finish the bar. */
  useEffect(() => {
    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (phase === "idle") return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px]"
      aria-hidden
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_2px_var(--color-primary)] transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: phase === "complete" ? 0 : 1,
        }}
      />
    </div>
  );
}
