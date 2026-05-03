import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import { config } from "./config.js";

export const ARTIFACTS_DIR = "artifacts";
export const CHAT_JSONL = "chat_messages.jsonl";

export type ArtifactPaths = {
  chatJsonl?: string;
  sidecarAudioM4a?: string;
};

/**
 * Heuristic Google Meet chat — open the side panel, then scrape. Meet's DOM changes often; this is best-effort.
 */
export async function ensureMeetChatPanelOpen(page: Page): Promise<void> {
  // Meet (English): Ctrl+Alt+C opens chat on many builds (same family as meet-teams shortcuts).
  try {
    await page.keyboard.press("Control+Alt+KeyC");
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    /* ignore */
  }

  const tryClick = async (loc: Locator) => {
    if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
      await loc.click({ timeout: 2500 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      return true;
    }
    return false;
  };

  const tryOpenInFrames = async (): Promise<boolean> => {
    if (
      await tryClick(
        page.getByRole("button", {
          name: /^(chat|in-call messages|show chat)$/i,
        })
      )
    ) {
      return true;
    }
    if (await tryClick(page.locator('[aria-label*="Chat" i]').first()))
      return true;
    if (await tryClick(page.locator('[data-tooltip="Chat" i]').first()))
      return true;
    if (await tryClick(page.getByText(/^Chat$/).first())) return true;

    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        if (
          await tryClick(
            frame.getByRole("button", {
              name: /chat|in-call messages|show chat/i,
            }).first()
          )
        ) {
          return true;
        }
        if (await tryClick(frame.locator('[aria-label*="Chat" i]').first())) {
          return true;
        }
        if (await tryClick(frame.locator('[data-tooltip="Chat" i]').first())) {
          return true;
        }
      } catch {
        /* detached frame */
      }
    }
    return false;
  };

  await tryOpenInFrames();
}

/** Runs in the browser: Meet chat often lives in iframes and/or shadow roots — main-frame-only scrape misses it. */
function browserChatScrape(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length < 1 || t.length > 8000) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const scanFlat = (root: Document | ShadowRoot) => {
    root.querySelectorAll("[data-message-text]").forEach((el) =>
      add(el.textContent ?? "")
    );
    root
      .querySelectorAll(
        '[role="log"] [data-message-text], [role="log"] span[dir="ltr"]'
      )
      .forEach((el) => add(el.textContent ?? ""));
    root
      .querySelectorAll(
        '[aria-live="polite"] [data-message-text], [jsname="dTKNkb"] span'
      )
      .forEach((el) => add(el.textContent ?? ""));
  };

  const walk = (root: Document | ShadowRoot, depth: number) => {
    if (depth > 14) return;
    scanFlat(root);
    root.querySelectorAll("*").forEach((el) => {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) walk(sr, depth + 1);
    });
  };

  walk(document, 0);
  return out;
}

async function scrapeChatBodies(page: Page): Promise<string[]> {
  const mergedKeys = new Set<string>();
  const ordered: string[] = [];
  const pushUnique = (arr: string[]) => {
    for (const body of arr) {
      const key = body.slice(0, 2000);
      if (mergedKeys.has(key)) continue;
      mergedKeys.add(key);
      ordered.push(body);
    }
  };

  for (const frame of page.frames()) {
    try {
      const arr = await frame.evaluate(browserChatScrape).catch(() => [] as string[]);
      pushUnique(arr);
    } catch {
      /* detached */
    }
  }
  return ordered;
}

export async function appendNewChatLines(
  page: Page,
  jsonlPath: string,
  seenKeys: Set<string>
): Promise<number> {
  const bodies = await scrapeChatBodies(page);
  let added = 0;
  const ts = Date.now();
  for (const body of bodies) {
    const key = body.slice(0, 2000);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    await appendFile(
      jsonlPath,
      `${JSON.stringify({ t: ts, text: body })}\n`,
      "utf8"
    );
    added++;
  }
  return added;
}

export type ArtifactTickState = {
  chatSeen: Set<string>;
  /** Çat paneli bir dəfə açılıb — təkrar Ctrl+Alt+C / düymə klikləri paneli bağlayıb açır, Meet-i pozur. */
  chatPanelPrimed: boolean;
  lastChatPollMs: number;
};

export function createArtifactState(startedMs: number): ArtifactTickState {
  const poll = config.meetArtifactChatPollMs;
  return {
    chatSeen: new Set(),
    chatPanelPrimed: false,
    /** First chat scrape runs on the first recording-loop tick (not N ms later). */
    lastChatPollMs: startedMs - poll - 1,
  };
}

/** Run periodic chat capture while in-call (called from the recording loop). */
export async function tickMeetingArtifacts(
  page: Page,
  outDir: string,
  state: ArtifactTickState,
  onStatus?: (m: string) => void
): Promise<void> {
  const now = Date.now();

  if (
    config.meetArtifactChat &&
    config.meetArtifactChatPollMs > 0 &&
    now - state.lastChatPollMs >= config.meetArtifactChatPollMs
  ) {
    state.lastChatPollMs = now;
    if (!state.chatPanelPrimed) {
      await ensureMeetChatPanelOpen(page);
      state.chatPanelPrimed = true;
    }
    const chatPath = join(outDir, ARTIFACTS_DIR, CHAT_JSONL);
    const n = await appendNewChatLines(page, chatPath, state.chatSeen);
    if (n > 0) onStatus?.(`artifact_chat_lines_${n}`);
  }
}

/**
 * Final scrape when the recording loop exits (normal end, timeout, or cancel). Catches messages since the
 * last poll — important when `MEET_ARTIFACT_CHAT_POLL_MS` is large or the call was shorter than one interval.
 */
export async function flushMeetingChat(
  page: Page,
  outDir: string,
  state: ArtifactTickState,
  onStatus?: (m: string) => void
): Promise<void> {
  if (!config.meetArtifactChat) return;
  if (!state.chatPanelPrimed) {
    await ensureMeetChatPanelOpen(page);
    state.chatPanelPrimed = true;
  }
  const chatPath = join(outDir, ARTIFACTS_DIR, CHAT_JSONL);
  const n = await appendNewChatLines(page, chatPath, state.chatSeen);
  if (n > 0) onStatus?.(`artifact_chat_lines_${n}`);
}

/** Last chat scrape when the recording loop exits (runs in `waitInMeeting` `finally`). */
export async function finalizeMeetingArtifacts(
  page: Page,
  outDir: string,
  state: ArtifactTickState,
  onStatus?: (m: string) => void
): Promise<void> {
  await flushMeetingChat(page, outDir, state, onStatus).catch(() => {});
}

export async function prepareArtifactDirs(outDir: string): Promise<void> {
  if (!config.meetArtifactChat) return;
  await mkdir(join(outDir, ARTIFACTS_DIR), { recursive: true });
}

export async function collectArtifactPaths(outDir: string): Promise<ArtifactPaths> {
  const base = join(outDir, ARTIFACTS_DIR);
  const chatPath = join(base, CHAT_JSONL);
  const audioPath = join(base, "meet-audio.m4a");

  const paths: ArtifactPaths = {};

  try {
    if ((await stat(chatPath).catch(() => null))?.isFile()) {
      paths.chatJsonl = chatPath;
    }
    if ((await stat(audioPath).catch(() => null))?.isFile()) {
      paths.sidecarAudioM4a = audioPath;
    }
  } catch {
    /* ignore */
  }

  return paths;
}
