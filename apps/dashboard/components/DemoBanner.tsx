"use client";

import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "./AuthGate";
import { cn } from "../lib/utils";

export function DemoBanner() {
  const [visible, setVisible] = useState(false);
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;

  useEffect(() => {
    // Only show if the user is a demo user
    if (user?.demo) {
      setVisible(true);
    }
  }, [user?.demo]);

  if (!visible) return null;

  return (
    <div className="relative isolate flex items-center gap-x-6 overflow-hidden bg-primary/10 px-6 py-2.5 sm:px-3.5 sm:before:flex-1">
      <div
        className="absolute left-[max(-7rem,calc(50%-52rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl"
        aria-hidden="true"
      >
        <div
          className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-primary to-primary/50 opacity-30"
          style={{
            clipPath:
              "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm leading-6 text-foreground">
          <strong className="font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" /> Demo Rejim Aktivdir
          </strong>
          <svg
            viewBox="0 0 2 2"
            className="mx-2 inline h-0.5 w-0.5 fill-current"
            aria-hidden="true"
          >
            <circle cx="1" cy="1" r="1" />
          </svg>
          Siz hazırda demo rejimindəsiniz. Real auth və S3 tələb olunmur. Bunu dayandırmaq üçün .env-də{" "}
          <code className="rounded bg-primary/20 px-1 font-mono text-xs font-bold">APP_DEMO_MODE=false</code> edin.
        </p>
      </div>
      <div className="flex flex-1 justify-end">
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="-m-3 p-3 focus-visible:outline-offset-[-4px]"
        >
          <span className="sr-only">Bağla</span>
          <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
