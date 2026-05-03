import { useEffect, useRef, useState } from "react";

/**
 * Keeps a loading/skeleton state visible for at least `minMs` after loading starts,
 * so very fast fetches still show a smooth skeleton shimmer instead of a one-frame flash.
 */
export function useMinimumSkeleton(isLoading: boolean, minMs = 420): boolean {
  const [show, setShow] = useState(isLoading);
  const loadStartedRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      loadStartedRef.current = Date.now();
      setShow(true);
      return;
    }
    const start = loadStartedRef.current;
    if (start === null) {
      setShow(false);
      return;
    }
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minMs - elapsed);
    const id = window.setTimeout(() => setShow(false), remaining);
    return () => window.clearTimeout(id);
  }, [isLoading, minMs]);

  return show;
}
