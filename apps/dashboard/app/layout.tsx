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
  openGraph: {
    title: "Meet Bot",
    description: "Automate your meeting notes with AI",
    images: ["/og.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
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
      </body>
    </html>
  );
}
