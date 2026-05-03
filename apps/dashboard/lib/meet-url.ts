/** Google Meet URL-dən otaq kodu (məs. `shk-hfti-vhd`). */
export function meetCodeFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}
