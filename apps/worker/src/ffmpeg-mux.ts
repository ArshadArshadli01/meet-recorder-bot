import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveFfmpegPath } from "./ffmpeg-path.js";

const SIDECAR_NAMES = ["meet-audio.wav", "audio.wav", "sidecar-audio.wav"];

/**
 * If a WAV exists next to the Playwright WebM (from external ffmpeg / Pulse / VB-Cable capture),
 * mux into MP4 so playback has sound. Requires `ffmpeg` on PATH.
 */
export async function muxWebmWithSidecarAudioIfPresent(
  videoWebmPath: string,
  outDir: string
): Promise<string | null> {
  let audioPath: string | null = null;
  for (const name of SIDECAR_NAMES) {
    const p = join(outDir, name);
    if (existsSync(p) && statSync(p).size > 1500) {
      audioPath = p;
      break;
    }
  }
  if (!audioPath) return null;

  const outMp4 = join(outDir, `${basename(videoWebmPath, ".webm")}-with-audio.mp4`);
  const ok = await runFfmpeg([
    "-y",
    "-i",
    videoWebmPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outMp4,
  ]);
  return ok ? outMp4 : null;
}

function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const bin = resolveFfmpegPath();
    let errBuf = "";
    const p = spawn(bin, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    p.stderr?.on("data", (c: Buffer) => {
      errBuf += c.toString();
      if (errBuf.length > 8000) errBuf = errBuf.slice(-8000);
    });
    p.on("error", () => resolve(false));
    p.on("close", (code) => {
      if (code !== 0 && errBuf.trim()) {
        process.stderr.write(`[ffmpeg-mux] ffmpeg stderr (exit ${code}): ${errBuf.slice(-1200)}\n`);
      }
      resolve(code === 0);
    });
  });
}
