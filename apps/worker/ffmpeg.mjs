#!/usr/bin/env node
/**
 * Run FFmpeg for CLI tasks (e.g. list WASAPI devices). Resolves binary like the worker:
 * MEET_FFMPEG_PATH → Windows `where ffmpeg` → bundled ffmpeg-static → `ffmpeg`.
 *
 * From repo root:
 *   npm run ffmpeg:wasapi-devices
 *   npm run ffmpeg -- -version
 *
 * Windows note: bundled ffmpeg-static often has NO wasapi support. For `-f wasapi`, install
 * the full build from https://www.gyan.dev/ffmpeg/builds/ and add to PATH or set MEET_FFMPEG_PATH.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

function resolveCliBinary() {
  const manual = process.env.MEET_FFMPEG_PATH?.trim();
  if (manual && manual !== "ffmpeg" && existsSync(manual)) {
    return manual;
  }
  if (process.platform === "win32") {
    try {
      const out = execFileSync("where.exe", ["ffmpeg"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
      const first = out.split(/\r?\n/)[0]?.trim();
      if (first && existsSync(first)) {
        return first;
      }
    } catch {
      /* no ffmpeg on PATH */
    }
  }
  const bundled =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : ffmpegStatic?.default;
  if (bundled && existsSync(bundled)) {
    return bundled;
  }
  return "ffmpeg";
}

function bundledFfmpegPath() {
  const p =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : ffmpegStatic?.default;
  return p && existsSync(p) ? p : null;
}

function isSameExecutable(a, b) {
  if (!a || !b) return false;
  const n = (x) => x.replace(/\\/g, "/").toLowerCase();
  return n(a) === n(b);
}

/** True if this invocation uses WASAPI (bundled "essentials" builds omit it). */
function argsUseWasapi(args) {
  const i = args.indexOf("-f");
  if (i >= 0 && args[i + 1] === "wasapi") return true;
  return args.includes("wasapi");
}

const args = process.argv.slice(2);
const bin = resolveCliBinary();

if (!process.env.MEET_FFMPEG_QUIET) {
  console.error(`[ffmpeg CLI] using: ${bin}`);
}

if (
  process.platform === "win32" &&
  argsUseWasapi(args) &&
  bundledFfmpegPath() &&
  isSameExecutable(bin, bundledFfmpegPath())
) {
  console.error(`
[ffmpeg CLI] This command needs FFmpeg with WASAPI. The selected binary is npm's
ffmpeg-static (essentials) — it does not include -f wasapi, so device listing will fail.

Fix (pick one):
  1) Use DirectShow instead (works with current Gyan WinGet builds): set MEET_WINDOWS_AUDIO=dshow,
     MEET_DSHOW_AUDIO=… from  npm run ffmpeg:dshow-devices  (often Stereo Mix — enable in Sound settings).
  2) Or set MEET_FFMPEG_PATH to a FFmpeg build that actually includes wasapi (many Gyan 8.x WinGet
     packages do NOT — check: ffmpeg -devices | findstr /i wasapi).
  3) Add ffmpeg.exe to PATH or MEET_FFMPEG_PATH, then retry  npm run ffmpeg:wasapi-devices
`);
  process.exit(1);
}

const child = spawn(bin, args, { stdio: "inherit", windowsHide: true });
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
child.on("exit", (code, sig) => {
  if (sig) process.exit(1);
  process.exit(code ?? 1);
});
