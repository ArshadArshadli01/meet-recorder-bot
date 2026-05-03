import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import type { MeetJobResult } from "./types.js";

const MAX_CHAT_LINES = 2000;
const MAX_CHAT_FILE_BYTES = 1_000_000;

function spacesPublicUrlForKey(key: string): string | null {
  const s = config.spaces;
  if (!s) return null;
  const enc = key.split("/").map(encodeURIComponent).join("/");
  return `${s.publicBaseUrl}/${enc}`;
}

export type EnrichJobOptions = {
  /**
   * When true and operator Spaces is configured, synthesize `spaces_url` for the primary
   * recording from `relativePath` (same key pattern the worker uses) if the worker omitted it.
   * Matches worker: anonymous jobs always want Spaces; `/me/bots` jobs only when `save_to_spaces`.
   */
  allowInferPrimaryVideoSpaces?: boolean;
};

/**
 * Reads `artifacts/chat_messages.jsonl` so GET /bots returns full chat text when present on disk.
 */
export async function enrichJobResultFromDisk(
  botId: string,
  jobState: string,
  rv: MeetJobResult | null,
  opts?: EnrichJobOptions
): Promise<MeetJobResult | null> {
  if (jobState !== "completed" || !rv) return rv;

  const dataDir = config.dataDir;
  const artifactsDir = join(dataDir, "recordings", botId, "artifacts");

  let chat_messages: Array<{ t: number; text: string }> | undefined;
  const chatPath = join(artifactsDir, "chat_messages.jsonl");
  try {
    const st = await stat(chatPath);
    if (st.isFile() && st.size > 0 && st.size <= MAX_CHAT_FILE_BYTES) {
      const raw = await readFile(chatPath, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const out: Array<{ t: number; text: string }> = [];
      for (const line of lines.slice(0, MAX_CHAT_LINES)) {
        try {
          const o = JSON.parse(line) as { t?: number; text?: string };
          if (typeof o.text === "string") {
            out.push({ t: Number(o.t) || 0, text: o.text });
          }
        } catch {
          /* skip bad line */
        }
      }
      if (out.length > 0) chat_messages = out;
    }
  } catch {
    /* missing chat file */
  }

  let merged: MeetJobResult = { ...rv };

  if (
    opts?.allowInferPrimaryVideoSpaces &&
    config.spaces &&
    merged.relativePath &&
    !merged.spaces_url &&
    !merged.spaces_error
  ) {
    const norm = merged.relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (norm.startsWith("recordings/")) {
      const baseFile = norm.split("/").pop();
      const candidates = baseFile
        ? [norm, `meet-recordings/${botId}/${baseFile}`]
        : [norm];
      for (const key of candidates) {
        const inferred = spacesPublicUrlForKey(key);
        if (inferred) {
          merged = { ...merged, spaces_url: inferred };
          break;
        }
      }
    }
  }

  if (config.spaces) {
    try {
      const st = await stat(chatPath);
      if (st.isFile() && st.size > 0 && !merged.artifact_urls?.chat_messages) {
        let chatUrl = spacesPublicUrlForKey(
          `recordings/${botId}/artifacts/chat_messages.jsonl`
        );
        if (!chatUrl) {
          chatUrl = spacesPublicUrlForKey(
            `meet-recordings/${botId}/artifacts/chat_messages.jsonl`
          );
        }
        if (chatUrl) {
          merged = {
            ...merged,
            artifact_urls: {
              ...merged.artifact_urls,
              chat_messages: chatUrl,
            },
          };
        }
      }
    } catch {
      /* no chat file */
    }
  }

  return {
    ...merged,
    ...(chat_messages ? { chat_messages } : {}),
  };
}
