import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "../components/ThemeProvider";
import { PageProgressBar } from "../components/PageProgressBar";

export const metadata: Metadata = {
  title: "Meet Bot",
  description: "Secure meeting recording dashboard",
  icons: {
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "Meet Bot",
  },
  verification: {
    google: "-QbS1vs4KD4OEnkjbdecfiMQzMHpmgGOgvRDJw29HC0",
  },
  openGraph: {
    title: "Meet Bot",
    description: "Automate your meeting notes with AI",
    images: ["/og.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az" suppressHydrationWarning className="notranslate" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="min-h-screen antialiased notranslate">
        <ThemeProvider>
          {/* `useSearchParams` requires a Suspense boundary; the bar itself
              renders nothing until a navigation starts so the fallback is
              `null`. */}
          <Suspense fallback={null}>
            <PageProgressBar />
          </Suspense>
          {children}
          <Toaster richColors position="top-center" closeButton />
        </ThemeProvider>

        {/* 
          Static footer for Google Branding Verification. 
          Must be visible in raw HTML and accessible without login on the home page.
        */}
        <footer className="w-full py-4 px-6 border-t border-border/10 bg-background/50 text-[10px] text-muted-foreground/30 flex justify-center gap-4">
          <p>&copy; 2026 Arshadli. Bütün hüquqlar qorunur.</p>
          <a href="/privacy-policy" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            Məxfilik Siyasəti
          </a>
          <a href="/terms" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            İstifadə Şərtləri
          </a>
        </footer>
      </body>
    </html>
  );
}
