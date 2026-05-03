import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import {
  isBundledFfmpegBinary,
  resolveFfmpegPathForParallelAudio,
} from "./ffmpeg-path.js";

const WAV_NAME = "meet-audio.wav";

/** True if the DirectShow label looks like a physical microphone (not loopback / Stereo Mix / virtual cable). */
function looksLikeMicOnlyDevice(deviceLine: string): boolean {
  const n = deviceLine.toLowerCase();
  if (
    /stereo mix|what u hear|wave out mix|multi output|vb-audio virtual cable|virtual cable|cable input|loopback/i.test(
      n
    )
  ) {
    return false;
  }
  if (/(microphone|mic array|\bmic\b|headset|smart sound technology)/i.test(n)) {
    return true;
  }
  return false;
}

/**
 * Records **system playback** (Meet audio from speakers/headphones), not the room microphone.
 * Linux: Pulse loopback source. Windows: WASAPI `loopback` or dshow Stereo Mix / VB-Cable — see `.env.example`.
 */
export async function startParallelAudioCapture(
  outDir: string,
  log: (msg: string) => void,
  logErr: (msg: string) => void
): Promise<(() => Promise<void>) | null> {
  if (!config.meetCaptureParallelAudio) return null;

  if (process.platform === "win32" && config.meetWindowsAudio === "dshow") {
    const raw = config.meetDshowAudio.trim();
    if (raw && config.meetPlaybackAudioOnly && looksLikeMicOnlyDevice(raw)) {
      log(
        "[audio] Refusing this DirectShow device — it looks like a microphone. The bot is configured for **Meet/playback audio only** (MEET_PLAYBACK_AUDIO_ONLY=true). Use WASAPI loopback (FFmpeg with `wasapi` + MEET_WASAPI_DEVICE=loopback and MEET_FFMPEG_PATH to a suitable build, e.g. winget install BtbN.FFmpeg.GPL.8.1), or dshow **Stereo Mix** / **VB-Cable Input** — not Microphone Array. Set MEET_PLAYBACK_AUDIO_ONLY=false only if you intentionally want mic audio."
      );
      return null;
    }
  }

  const wavPath = join(outDir, WAV_NAME);
  const args = buildFfmpegAudioArgs(wavPath);
  if (!args) {
    if (process.platform === "win32" && config.meetWindowsAudio === "dshow") {
      log(
        "[audio] Set MEET_DSHOW_AUDIO to a **playback loopback** source (Stereo Mix or VB-Cable), not a mic — run npm run ffmpeg:dshow-devices. Or use MEET_WINDOWS_AUDIO=wasapi + loopback with FFmpeg that supports WASAPI."
      );
    } else {
      log("[audio] parallel capture not supported on this platform");
    }
    return null;
  }

  const ffmpegBin = resolveFfmpegPathForParallelAudio();
  if (
    process.platform === "win32" &&
    config.meetWindowsAudio === "wasapi" &&
    isBundledFfmpegBinary(ffmpegBin)
  ) {
    log(
      "[audio] skipping WASAPI capture — bundled FFmpeg has no WASAPI. Use MEET_WINDOWS_AUDIO=dshow + MEET_DSHOW_AUDIO (Stereo Mix), or set MEET_FFMPEG_PATH to a build with wasapi."
    );
    return null;
  }

  const proc = spawn(ffmpegBin, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
  });

  proc.on("error", (e) => {
    logErr(`[audio] ffmpeg spawn failed (${ffmpegBin}): ${String(e)}`);
  });

  proc.on("exit", (code, sig) => {
    if (code !== 0 && code !== null) {
      logErr(
        `[audio] ffmpeg recorder exited code=${code} sig=${sig} — ${stderr.slice(-600)}`
      );
    }
  });

  log(`[audio] ffmpeg recording to ${WAV_NAME} (${args.slice(0, 6).join(" ")} …)`);

  return () => stopAudioCapture(proc, wavPath, log, logErr);
}

function buildFfmpegAudioArgs(wavPath: string): string[] | null {
  if (process.platform === "linux") {
    const src = config.meetPulseSource;
    return [
      "-nostdin",
      "-y",
      "-f",
      "pulse",
      "-thread_queue_size",
      "4096",
      "-i",
      src,
      "-acodec",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      wavPath,
    ];
  }

  if (process.platform === "win32") {
    if (config.meetWindowsAudio === "dshow") {
      const raw = config.meetDshowAudio;
      if (!raw) return null;
      const inputSpec = raw.includes("=") ? raw : `audio=${raw}`;
      return [
        "-nostdin",
        "-y",
        "-f",
        "dshow",
        "-i",
        inputSpec,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        wavPath,
      ];
    }

    const dev = config.meetWasapiDevice || "loopback";
    return [
      "-nostdin",
      "-y",
      "-f",
      "wasapi",
      "-i",
      dev,
      "-acodec",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      wavPath,
    ];
  }

  return null;
}

async function stopAudioCapture(
  proc: ChildProcess,
  wavPath: string,
  log: (msg: string) => void,
  logErr: (msg: string) => void
): Promise<void> {
  if (!proc.pid) {
    log("[audio] ffmpeg never started; skipping stop");
  } else {
    await Promise.race([
      new Promise<void>((resolve) => {
        proc.once("close", resolve);
        try {
          proc.kill("SIGINT");
        } catch {
          try {
            proc.kill();
          } catch {
            resolve();
          }
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
    try {
      if (proc.exitCode === null) proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  try {
    if (existsSync(wavPath)) {
      const sz = statSync(wavPath).size;
      if (sz < 2000) {
        unlinkSync(wavPath);
        log("[audio] dropped tiny WAV (no usable capture)");
      } else {
        log(`[audio] saved WAV (${Math.round(sz / 1024)} KiB)`);
      }
    }
  } catch (e) {
    logErr(`[audio] finalize WAV: ${String(e)}`);
  }
}
