import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { config } from "./config.js";

function bundledFfmpegPath(): string | null {
  if (typeof ffmpegStatic === "string" && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return null;
}

/**
 * Docker/apt `ffmpeg` includes `-f pulse`; npm `ffmpeg-static` usually does **not** — x11grab+pulse must use system ffmpeg.
 */
function resolveLinuxSystemFfmpeg(): string | null {
  if (process.platform !== "linux") return null;
  const candidates = ["/usr/bin/ffmpeg", "/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    const first = execFileSync("which", ["ffmpeg"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    })
      .trim()
      .split("\n")[0]
      ?.trim();
    if (
      first &&
      existsSync(first) &&
      !/ffmpeg-static|node_modules[/\\]/.test(first)
    ) {
      return first;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * If `MEET_FFMPEG_PATH` is set in a **host** `.env` (e.g. `C:\...\ffmpeg.exe`) and passed into a **Linux**
 * worker container, that path does not exist there and must be ignored so we fall back to `/usr/bin/ffmpeg`.
 */
function resolveExplicitFfmpegPathIfUsable(): string | null {
  const raw = config.meetFfmpegPath.trim();
  if (!raw || raw === "ffmpeg") return null;
  if (existsSync(raw)) return raw;
  return null;
}

/** True if `resolvedPath` is the npm `ffmpeg-static` binary (no WASAPI on Windows essentials build). */
export function isBundledFfmpegBinary(resolvedPath: string): boolean {
  const b = bundledFfmpegPath();
  if (!b) return false;
  const n = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return n(resolvedPath) === n(b);
}

/** First `ffmpeg.exe` on Windows PATH (`where.exe`), or null. */
export function resolveFfmpegFromWindowsPath(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync("where.exe", ["ffmpeg"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    const first = out.split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) return first;
  } catch {
    /* not on PATH */
  }
  return null;
}

/**
 * Prefer explicit `MEET_FFMPEG_PATH`, else on Linux+x11 **system** ffmpeg (pulse demuxer),
 * else `ffmpeg-static`, else `ffmpeg` on PATH.
 */
export function resolveFfmpegPath(): string {
  const manual = resolveExplicitFfmpegPathIfUsable();
  if (manual) return manual;

  if (process.platform === "linux" && config.meetLinuxRecordMode === "x11") {
    const sys = resolveLinuxSystemFfmpeg();
    if (sys) return sys;
  }

  const bundled = bundledFfmpegPath();
  if (bundled) return bundled;

  return "ffmpeg";
}

/**
 * Parallel capture on Windows: WASAPI needs a build that includes `-f wasapi` (not npm essentials).
 * DirectShow (`MEET_WINDOWS_AUDIO=dshow`) works with the bundled ffmpeg-static demuxer list.
 */
export function resolveFfmpegPathForParallelAudio(): string {
  if (process.platform === "win32" && config.meetWindowsAudio === "dshow") {
    return resolveFfmpegPath();
  }

  const manual = resolveExplicitFfmpegPathIfUsable();
  if (manual) return manual;

  if (process.platform === "win32") {
    const fromPath = resolveFfmpegFromWindowsPath();
    if (fromPath) return fromPath;
  }

  if (process.platform === "linux") {
    const sys = resolveLinuxSystemFfmpeg();
    if (sys) return sys;
  }

  const bundled = bundledFfmpegPath();
  if (bundled) return bundled;

  return "ffmpeg";
}
