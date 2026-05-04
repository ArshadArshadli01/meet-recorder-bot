import { spawn } from "node:child_process";
import { rename, unlink } from "node:fs/promises";
import { resolveFfmpegPath } from "./ffmpeg-path.js";
import { workerLog, workerErr } from "./worker-log.js";

/**
 * Runs ffmpeg with '-movflags +faststart' to move the moov atom to the beginning of the file.
 * This enables smooth seeking (scrubbing) in web players and downloaded files.
 * Uses '-c copy' to ensure zero quality loss and near-instant processing.
 */
export async function optimizeMp4ForWeb(filePath: string): Promise<boolean> {
  const bin = resolveFfmpegPath();
  const tmpPath = `${filePath}.optimized.mp4`;
  
  const args = [
    "-y",
    "-i", filePath,
    "-c", "copy",
    "-movflags", "+faststart",
    tmpPath
  ];

  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    
    p.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });

    p.on("error", (err) => {
      workerErr(`[ffmpeg-optimize] spawn failed: ${String(err)}`);
      resolve(false);
    });

    p.on("close", async (code) => {
      if (code === 0) {
        try {
          await rename(tmpPath, filePath);
          resolve(true);
        } catch (e) {
          workerErr(`[ffmpeg-optimize] rename failed: ${String(e)}`);
          resolve(false);
        }
      } else {
        workerErr(`[ffmpeg-optimize] ffmpeg failed (code ${code}): ${stderr.slice(-500)}`);
        try { await unlink(tmpPath); } catch {}
        resolve(false);
      }
    });
  });
}
