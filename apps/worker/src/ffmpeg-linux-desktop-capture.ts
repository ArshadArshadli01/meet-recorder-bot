import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { resolveFfmpegPath } from "./ffmpeg-path.js";

/** Output filename — preferred by `findRecordedVideo` over Playwright WebM. */
export const LINUX_DESKTOP_MP4 = "meet-desktop.mp4";

/** Pulse-only AAC-in-M4A sidecar under `artifacts/` (Linux x11 + separate-artifact mode). */
export const LINUX_SIDE_AUDIO_M4A = "meet-audio.m4a";

const EARLY_EXIT_WAIT_MS = 1500;

/** Muxer opts so partial files (cancel / SIGINT) stay playable in browsers — classic MP4 only writes `moov` at EOF. */
/** Omit `default_base_mffrm2` — not in all ffmpeg builds (fails to parse on some Docker/apt ffmpegs). */
const MP4_WEB_MOVFLAGS = "+frag_keyframe+empty_moov";

/** Crop bottom strip from desktop grab (Meet toolbar) or scale to viewport size. */
function x11GrabVideoFilter(w: number, h: number): string {
  const cropBottom = config.meetRecordingCropBottomPx;
  if (cropBottom > 0 && cropBottom < h - 24) {
    const outH = h - cropBottom;
    return `crop=${w}:${outH}:0:0`;
  }
  return `scale=${w}:${h}`;
}

function buildX11PulseArgs(
  x11Input: string,
  w: number,
  h: number,
  pulseSrc: string,
  outPath: string
): string[] {
  return [
    "-y",
    "-thread_queue_size",
    "512",
    "-video_size",
    `${w}x${h}`,
    "-framerate",
    "25",
    "-f",
    "x11grab",
    "-i",
    x11Input,
    "-thread_queue_size",
    "512",
    "-f",
    "pulse",
    "-i",
    pulseSrc,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-g",
    "50",
    "-keyint_min",
    "25",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-vsync",
    "2",
    "-vf",
    x11GrabVideoFilter(w, h),
    "-f",
    "mp4",
    "-movflags",
    MP4_WEB_MOVFLAGS,
    outPath,
  ];
}

/** Video-only fallback when ffmpeg has no `pulse` demuxer (common in minimal Docker images). */
function buildX11VideoOnlyArgs(
  x11Input: string,
  w: number,
  h: number,
  outPath: string
): string[] {
  return [
    "-y",
    "-thread_queue_size",
    "512",
    "-video_size",
    `${w}x${h}`,
    "-framerate",
    "25",
    "-f",
    "x11grab",
    "-i",
    x11Input,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-g",
    "50",
    "-keyint_min",
    "25",
    "-an",
    "-vf",
    x11GrabVideoFilter(w, h),
    "-f",
    "mp4",
    "-movflags",
    MP4_WEB_MOVFLAGS,
    outPath,
  ];
}

function pulseInputUnsupported(stderr: string): boolean {
  return (
    /Unknown input format:\s*['"]?pulse/i.test(stderr) ||
    /Unknown\s+input\s+format.*pulse/i.test(stderr)
  );
}

function attachExitLogger(
  proc: ChildProcess,
  getStderr: () => string,
  logErr: (msg: string) => void
): void {
  proc.on("exit", (code, sig) => {
    if (code !== 0 && code !== null) {
      logErr(
        `[ffmpeg-desktop] ffmpeg exited code=${code} sig=${sig} — ${getStderr().slice(-800)}`
      );
    }
  });
}

/**
 * ffmpeg writes a `Stream mapping:` block (`Stream #1:0 -> #0:1 (pcm... -> aac)`) once the pulse
 * input is decoded, then progress lines `frame=… size=…kB time=00:00:0X.XX bitrate=…`. We treat the
 * combination as proof that audio packets are actually flowing — Stream-mapping alone shows up even
 * when Pulse delivers an empty stream, so we also require a non-zero `time=` reading.
 */
function makeAudioFlowDetector(): {
  onStderr: (chunk: string) => void;
  audioPacketsSeen: () => boolean;
} {
  let mappedAudio = false;
  let sawNonZeroTime = false;
  return {
    onStderr(chunk: string) {
      if (!mappedAudio && /Stream\s+#1:\d+\s*->\s*#0:\d+.*aac/i.test(chunk)) {
        mappedAudio = true;
      }
      if (mappedAudio && !sawNonZeroTime) {
        const m = chunk.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          const hh = Number(m[1]);
          const mm = Number(m[2]);
          const ss = Number(m[3]);
          if (hh + mm + ss > 0) sawNonZeroTime = true;
        }
      }
    },
    audioPacketsSeen() {
      return mappedAudio && sawNonZeroTime;
    },
  };
}

async function waitAliveOrDead(proc: ChildProcess): Promise<"alive" | "dead"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("alive"), EARLY_EXIT_WAIT_MS);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve("dead");
    });
  });
}

export type LinuxDesktopRecordingHandle = {
  stop: () => Promise<void>;
  outputPath: string;
  /** True when x11grab+pulse mux is running; false when ffmpeg fell back to silent video-only capture. */
  pulseAudioMuxed: boolean;
  /**
   * After `stop()` resolves, returns whether ffmpeg ever processed a non-zero-duration audio stream.
   * Always `false` for the video-only fallback. Worker uses this to fail-loud when the recorder ran
   * but no real audio packets ever flowed through Pulse.
   */
  audioPacketsSeen: () => boolean;
};

/**
 * meetingbot-style capture: ffmpeg **x11grab** + **pulse** when available.
 * If this ffmpeg build has no pulse demuxer (Docker minimal ffmpeg), falls back to **x11grab only**
 * (silent MP4 — meeting audio requires libpulse / full ffmpeg).
 */
export async function startLinuxX11PulseRecording(
  outDir: string,
  log: (msg: string) => void,
  logErr: (msg: string) => void
): Promise<LinuxDesktopRecordingHandle | null> {
  if (process.platform !== "linux" || config.meetLinuxRecordMode !== "x11") {
    return null;
  }

  const display = (process.env.DISPLAY ?? ":99").trim();
  const x11Input = /\.\d+$/.test(display) ? display : `${display}.0`;
  const w = config.videoWidth;
  const h = config.videoHeight;
  const pulseSrc = config.meetPulseSource;
  const outPath = join(outDir, LINUX_DESKTOP_MP4);
  const bin = resolveFfmpegPath();

  let stderr = "";
  const audioFlow = makeAudioFlowDetector();
  const procPulse = spawn(bin, buildX11PulseArgs(x11Input, w, h, pulseSrc, outPath), {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });

  procPulse.stderr?.on("data", (c: Buffer) => {
    const text = c.toString();
    stderr += text;
    audioFlow.onStderr(text);
  });

  procPulse.on("error", (e) => {
    logErr(`[ffmpeg-desktop] spawn failed (${bin}): ${String(e)}`);
  });

  const pulseOutcome = await waitAliveOrDead(procPulse);

  if (pulseOutcome === "alive") {
    attachExitLogger(procPulse, () => stderr, logErr);
    log(
      `[recording] ffmpeg x11grab+pulse → ${LINUX_DESKTOP_MP4} display=${x11Input} pulse=${pulseSrc}`
    );
    return {
      outputPath: outPath,
      pulseAudioMuxed: true,
      audioPacketsSeen: () => audioFlow.audioPacketsSeen(),
      stop: () => stopFfmpegProcess(procPulse),
    };
  }

  const pulseStderr = stderr;
  const canFallbackVideoOnly = pulseInputUnsupported(pulseStderr);

  if (!canFallbackVideoOnly) {
    logErr(
      `[ffmpeg-desktop] ffmpeg exited before recording (${pulseStderr.slice(-1200)})`
    );
  } else {
    logErr(
      `[ffmpeg-desktop] pulse input not supported by this ffmpeg (no libpulse demuxer). Falling back to x11grab video-only — no meeting audio. Install ffmpeg with PulseAudio support for audio in ${LINUX_DESKTOP_MP4}.`
    );
  }

  stderr = "";
  const procVideo = spawn(
    bin,
    buildX11VideoOnlyArgs(x11Input, w, h, outPath),
    {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    }
  );

  procVideo.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
  });

  procVideo.on("error", (e) => {
    logErr(`[ffmpeg-desktop] x11-only spawn failed (${bin}): ${String(e)}`);
  });

  const videoOutcome = await waitAliveOrDead(procVideo);

  if (videoOutcome === "dead") {
    const msg = `[ffmpeg-desktop] x11grab-only ffmpeg also exited immediately — ${stderr.slice(-1200)}`;
    logErr(msg);
    throw new Error(
      "ffmpeg could not start desktop capture (x11grab failed). Check DISPLAY, video_size, and ffmpeg logs."
    );
  }

  attachExitLogger(procVideo, () => stderr, logErr);
  log(
    `[recording] ffmpeg x11grab only → ${LINUX_DESKTOP_MP4} display=${x11Input} (no audio)`
  );

  return {
    outputPath: outPath,
    pulseAudioMuxed: false,
    audioPacketsSeen: () => false,
    stop: () => stopFfmpegProcess(procVideo),
  };
}

/**
 * Second ffmpeg reading the same Pulse monitor → standalone M4A (AAC).
 * Only valid when the desktop recorder uses pulse ( Meeting BaaS–style split audio file).
 */
export async function startLinuxPulseSidecarRecording(
  outDir: string,
  log: (msg: string) => void,
  logErr: (msg: string) => void
): Promise<{ stop: () => Promise<void>; outputPath: string } | null> {
  if (process.platform !== "linux" || config.meetLinuxRecordMode !== "x11") {
    return null;
  }

  const pulseSrc = config.meetPulseSource;
  const artifactsDir = join(outDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const outPath = join(artifactsDir, LINUX_SIDE_AUDIO_M4A);
  const bin = resolveFfmpegPath();

  let stderr = "";
  const args = [
    "-y",
    "-thread_queue_size",
    "512",
    "-f",
    "pulse",
    "-i",
    pulseSrc,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "mp4",
    "-movflags",
    MP4_WEB_MOVFLAGS,
    outPath,
  ];

  const proc = spawn(bin, args, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });

  proc.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
  });

  proc.on("error", (e) => {
    logErr(`[ffmpeg-sidecar-audio] spawn failed (${bin}): ${String(e)}`);
  });

  const outcome = await waitAliveOrDead(proc);
  if (outcome === "dead") {
    logErr(
      `[ffmpeg-sidecar-audio] exited immediately — ${stderr.slice(-900)}`
    );
    return null;
  }

  attachExitLogger(proc, () => stderr, logErr);
  log(`[recording] ffmpeg pulse-only → artifacts/${LINUX_SIDE_AUDIO_M4A} pulse=${pulseSrc}`);
  return {
    outputPath: outPath,
    stop: () => stopFfmpegProcess(proc),
  };
}

async function waitProcClose(proc: ChildProcess, ms: number): Promise<void> {
  if (proc.exitCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => proc.once("close", resolve)),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}

async function stopFfmpegProcess(proc: ChildProcess): Promise<void> {
  if (!proc.pid) return;

  try {
    proc.stdin?.write("q\n");
    proc.stdin?.end();
  } catch {
    /* ignore */
  }

  await waitProcClose(proc, 6000);

  if (proc.exitCode !== null) return;

  try {
    proc.kill("SIGINT");
  } catch {
    /* ignore */
  }

  await waitProcClose(proc, 14_000);

  try {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}
