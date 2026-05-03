"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Sparkles, X, Info } from "lucide-react";
import { useAuth } from "./AuthGate";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;

  useEffect(() => {
    // Only show in demo mode and if not seen before in this session
    const hasSeen = sessionStorage.getItem("meet-bot:welcome-seen");
    
    if (user?.demo && !hasSeen) {
      setIsOpen(true);
    }
  }, [user?.demo]);

  const close = () => {
    sessionStorage.setItem("meet-bot:welcome-seen", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={close}
      />
      
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="absolute right-4 top-4">
          <button 
            onClick={close}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Meet Bot Demo-ya xoş gəlmisiniz!</h2>
          <p className="mt-2 text-muted-foreground">
            Siz hazırda tətbiqi heç bir quraşdırma (Google OAuth, S3) olmadan yoxlamaq üçün **Demo Rejimindəsiniz**.
          </p>

          <div className="mt-8 space-y-6">
            <section>
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-success">
                <CheckCircle2 className="h-4 w-4" /> Nələr aktivdir?
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-foreground/80">
                <li className="flex items-start gap-2">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-success" />
                  Google Meet görüşlərini qeydə alma (Recorder)
                </li>
                <li className="flex items-start gap-2">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-success" />
                  Yerli serverdə yadda saxlama (Local Storage)
                </li>
                <li className="flex items-start gap-2">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-success" />
                  Botların idarə edilməsi və tarixçə paneli
                </li>
              </ul>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <XCircle className="h-4 w-4" /> Nələr məhduddur?
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2 opacity-80">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  Google Drive-a avtomatik yükləmə
                </li>
                <li className="flex items-start gap-2 opacity-80">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  Xarici Object Storage (S3 / Spaces) inteqrasiyası
                </li>
                <li className="flex items-start gap-2 opacity-80">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  Real Google hesabı ilə giriş (OAuth)
                </li>
                <li className="flex items-start gap-2 opacity-80">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  FCM Push (Mobil) bildirişləri
                </li>
                <li className="flex items-start gap-2 opacity-80">
                  <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  Real-time status izləmə (Avtomatik yenilənmə)
                </li>
              </ul>
            </section>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Button onClick={close} size="lg" className="w-full">
              Anladım, başlayaq
            </Button>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>
                Bunu söndürmək və real servisləri qoşmaq üçün <code>.env</code> faylında 
                <code>APP_DEMO_MODE=false</code> təyin edin.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
