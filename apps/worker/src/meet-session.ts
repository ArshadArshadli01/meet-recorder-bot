import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Locator, Page } from "playwright";
import { config } from "./config.js";
import {
  startLinuxPulseSidecarRecording,
  startLinuxX11PulseRecording,
} from "./ffmpeg-linux-desktop-capture.js";
import {
  collectArtifactPaths,
  createArtifactState,
  finalizeMeetingArtifacts,
  prepareArtifactDirs,
  tickMeetingArtifacts,
  type ArtifactPaths,
} from "./meet-artifacts.js";
import { buildMeetLaunchArgs, getMeetChromium } from "./meet-browser.js";
import { applyMeetRecordingUiChrome } from "./meet-recording-ui.js";

function useLinuxX11Recording(): boolean {
  return process.platform === "linux" && config.meetLinuxRecordMode === "x11";
}

/**
 * Same stable pre-join field as meetingbot's Meet bot — placeholder-based locators often miss.
 * @see https://github.com/meetingbot/meetingbot/blob/main/src/bots/meet/src/bot.ts
 */
const MEET_GUEST_NAME_INPUT = 'input[type="text"][aria-label="Your name"]';

/** meetingbot: //button[.//span[text()="Ask to join"]] — real control uses a span child. */
const MEET_ASK_TO_JOIN_XPATH = '//button[.//span[normalize-space()="Ask to join"]]';
const MEET_JOIN_NOW_XPATH = '//button[.//span[normalize-space()="Join now"]]';
/** meetingbot `infoPopupClick` — "Others might see you differently" etc. */
const MEET_GOT_IT_XPATH = '//button[.//span[normalize-space()="Got it"]]';

/** meetingbot uses generic `[aria-label*="Turn off microphone"]` (not always `<button>`). */
const MEET_MUTE_MIC_SELECTOR = '[aria-label*="Turn off microphone"]';
const MEET_CAMERA_OFF_SELECTOR = '[aria-label*="Turn off camera"]';

/** meetingbot: joined when Leave call control exists (stronger than text heuristics). */
const MEET_LEAVE_CALL_XPATH = '//button[@aria-label="Leave call"]';

/** Meet often logs 403/404 on fonts, analytics, or secondary APIs — not fatal to joining. */
function isNoiseMeetConsoleMessage(text: string): boolean {
  if (/Failed to load resource.*\b(403|404)\b/i.test(text)) return true;
  if (/net::ERR_BLOCKED_BY_CLIENT/i.test(text)) return true;
  return false;
}

/** meetingbot `joinMeeting`: small mouse path before `goto` to mimic human interaction. */
async function simulatePointerBeforeMeetNavigation(page: Page, onStatus?: (m: string) => void) {
  onStatus?.("meet_pointer_warmup");
  try {
    await page.mouse.move(10, 672);
    await page.mouse.move(102, 872);
    await page.mouse.move(114, 1472);
    await sleep(300);
    await page.mouse.move(114, 100);
    await page.mouse.click(100, 100);
  } catch {
    /* blank page or no viewport yet */
  }
}

export type MeetSessionInput = {
  meetingUrl: string;
  botName: string;
  outDir: string;
  /** When true, Playwright session stops at next cancel check (join loop / recording loop). */
  isCancelled?: () => Promise<boolean>;
  onStatus?: (msg: string) => void;
};

export type MeetSessionResult = {
  videoAbsolutePath: string;
  note?: string;
  /** Set when stop was requested via cancel API; browser still closes and WebM is finalized when possible. */
  cancelled?: boolean;
  /** Optional multi-artifact paths (chat JSONL, sidecar M4A) under `outDir/artifacts/`. */
  artifacts?: ArtifactPaths;
  /**
   * Linux x11 only: `true` when ffmpeg runs x11grab+pulse; `false` when ffmpeg fell back to **silent** x11-only
   * (image ffmpeg lacks pulse demuxer). `undefined` when not using desktop MP4 capture.
   */
  x11DesktopPulseMuxed?: boolean;
  /**
   * Linux x11 only: `true` when ffmpeg observed real, non-zero-duration audio packets through Pulse;
   * `false` when ffmpeg ran (with or without `-f pulse`) but never received any audio data; `undefined`
   * when not using desktop MP4 capture. Worker uses this for fail-loud on silent recordings.
   */
  audioCaptured?: boolean;
};

/**
 * Thrown when cancel is requested mid-session. Caught in `runMeetRecording` so the browser can close,
 * WebM can flush, and the worker can upload to S3. Rethrown only if no WebM file exists.
 */
export class MeetRecordingCancelledError extends Error {
  constructor(message = "Recording cancelled via API") {
    super(message);
    this.name = "MeetRecordingCancelledError";
  }
}

/**
 * Automates guest join on Meet. Recording: Playwright WebM (silent) by default; on Linux + `MEET_LINUX_RECORD_MODE=x11`,
 * uses meetingbot-style ffmpeg x11grab+pulse → `meet-desktop.mp4` with sound.
 */
export async function runMeetRecording(
  input: MeetSessionInput
): Promise<MeetSessionResult> {
  const { meetingUrl, botName, outDir, onStatus, isCancelled } = input;
  await mkdir(outDir, { recursive: true });
  await prepareArtifactDirs(outDir);

  onStatus?.("launching_browser");
  const chromiumLauncher = getMeetChromium();
  if (config.meetStealth) onStatus?.("launch_stealth_chromium");

  const browser = await chromiumLauncher.launch({
    headless: config.headless,
    args: buildMeetLaunchArgs(),
  });

  /**
   * In x11 desktop-capture mode we want Chromium's window to fill the Xvfb screen so ffmpeg x11grab
   * captures all UI without crop. Forcing a Playwright viewport here resizes the window and undoes
   * `--start-fullscreen`, leaving black bars/cropped regions in the recording. Pass `viewport: null`
   * so the page tracks the OS window instead. Playwright's WebM recording path still needs an explicit
   * size, so the non-x11 branch keeps the legacy viewport.
   */
  const context = await browser.newContext({
    userAgent: config.meetUserAgent,
    ...(useLinuxX11Recording()
      ? { viewport: null }
      : {
          viewport: { width: config.videoWidth, height: config.videoHeight },
          recordVideo: {
            dir: outDir,
            size: { width: config.videoWidth, height: config.videoHeight },
          },
        }),
    locale: "en-US",
    permissions: ["camera", "microphone"],
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript(
    ({ w, h }: { w: number; h: number }) => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
      Object.defineProperty(window, "innerWidth", { get: () => w });
      Object.defineProperty(window, "innerHeight", { get: () => h });
      Object.defineProperty(window, "outerWidth", { get: () => w });
      Object.defineProperty(window, "outerHeight", { get: () => h });
    },
    { w: config.videoWidth, h: config.videoHeight }
  );

  const page = await context.newPage();
  await sleep(700 + Math.floor(Math.random() * 600));

  let cancelledByApi = false;
  let x11DesktopPulseMuxed: boolean | undefined;
  let audioCaptured: boolean | undefined;
  try {
    try {
      await openMeetPage(page, meetingUrl, outDir, onStatus);

      onStatus?.("join_flow_started");
      await assertNotSignInOnly(page);
      onStatus?.("join_flow_after_signin_check");
      await dismissCookies(page, onStatus);
      await dismissMeetInfoPopups(page, onStatus);
      await clickJoinAsGuestIfPresent(page, onStatus);
      onStatus?.("join_flow_before_name");
      await enterGuestName(page, botName, onStatus);
      await muteMicAndCameraPrejoin(page, onStatus);
      await continueWithoutMediaIfPresent(page, onStatus);
      await enterGuestName(page, botName, onStatus);
      await sleep(600);
      await enterGuestName(page, botName, onStatus);
      await dismissMeetInfoPopups(page, onStatus);
      await clickJoinOrAsk(page, onStatus, isCancelled);
      await waitForWaitingRoomOrCall(page, outDir, onStatus, isCancelled);

      onStatus?.("in_lobby_or_call");
      const inMeet = await waitInMeeting(page, outDir, onStatus, isCancelled);
      x11DesktopPulseMuxed = inMeet.pulseAudioMuxed;
      audioCaptured = inMeet.audioPacketsSeen;
    } catch (err) {
      if (err instanceof MeetRecordingCancelledError) {
        cancelledByApi = true;
        onStatus?.("cancelled_flushing_video");
      } else {
        throw err;
      }
    }
  } finally {
    onStatus?.("closing_browser");
    await context.close();
    await browser.close();
  }

  let videoPath: string;
  if (cancelledByApi && useLinuxX11Recording()) {
    onStatus?.("cancelled_waiting_desktop_flush");
    await sleep(500);
  }
  try {
    videoPath = await findRecordedVideo(outDir, { cancelled: cancelledByApi });
  } catch (err) {
    if (cancelledByApi) {
      throw new MeetRecordingCancelledError(
        useLinuxX11Recording()
          ? "Recording cancelled before x11 ffmpeg wrote a usable meet-desktop.mp4 (cancel very early, or capture had no frames yet)."
          : "Recording cancelled before Playwright wrote a WebM (cancel very early, or no frames yet)."
      );
    }
    throw err;
  }

  const extra = await collectArtifactPaths(outDir);
  const artifacts: ArtifactPaths = { ...extra };
  const hasArtifacts =
    Boolean(artifacts.chatJsonl) ||
    Boolean(artifacts.sidecarAudioM4a);

  const baseNote = cancelledByApi
    ? useLinuxX11Recording()
      ? "Stopped by cancel API; meet-desktop.mp4 is fragmented (fMP4) for browser playback on early stop — upload runs when Spaces is configured."
      : "Stopped by cancel API; partial WebM finalized after browser close — upload runs when Spaces is configured."
    : useLinuxX11Recording()
      ? x11DesktopPulseMuxed === false
        ? "Docker/Linux x11 desktop MP4 (video-only: ffmpeg in this image has no pulse input — no meeting audio; rebuild with full ffmpeg or fix Pulse)."
        : x11DesktopPulseMuxed === true
          ? "Docker/Linux x11grab+pulse recording (meetingbot-style MP4 with audio)."
          : "Docker/Linux x11 desktop recording."
      : "If video is empty, the bot may still be in the lobby or Meet blocked automation.";
  return {
    videoAbsolutePath: videoPath,
    cancelled: cancelledByApi,
    artifacts: hasArtifacts ? artifacts : undefined,
    x11DesktopPulseMuxed,
    audioCaptured,
    note: baseNote,
  };
}

async function openMeetPage(
  page: Page,
  meetingUrl: string,
  outDir: string,
  onStatus?: (msg: string) => void
): Promise<void> {
  onStatus?.("opening_meet");
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (isNoiseMeetConsoleMessage(t)) return;
    if (t.length < 400) console.error("[meet page console]", t);
  });

  await simulatePointerBeforeMeetNavigation(page, onStatus);

  const started = Date.now();
  try {
    onStatus?.(`navigating_to_meet_wait_${config.meetGotoWaitUntil}`);
    const response = await page.goto(meetingUrl, {
      waitUntil: config.meetGotoWaitUntil,
      timeout: config.meetGotoTimeoutMs,
    });
    const ms = Date.now() - started;
    const status = response?.status() ?? 0;
    onStatus?.(`meet_http_${status}_after_${ms}ms`);
    if (status >= 400) {
      await captureDebugShot(page, outDir, "http-error");
      throw new Error(
        `Meet returned HTTP ${status} — link may be invalid, expired, or blocked for this network/IP.`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/^Meet returned HTTP \d+/u.test(msg)) {
      throw err;
    }
    await captureDebugShot(page, outDir, "goto-failed");
    const hint =
      /Timeout|timeout/i.test(msg)
        ? " Navigation timed out — Meet may block datacenter/automated browsers, or DNS/firewall from Docker is blocking Google. See debug-goto-failed.png in the job recording folder."
        : "";
    throw new Error(`${msg}${hint ? `. ${hint}` : ""}`);
  }

  await page.bringToFront().catch(() => {});

  await detectCaptchaOrBlock(page, outDir);

  let title = "";
  try {
    title = (await page.title()).slice(0, 120);
  } catch {
    /* ignore */
  }
  onStatus?.(`meet_dom_ready_title:${title || "(empty)"}`);
}

async function captureDebugShot(page: Page, outDir: string, label: string): Promise<void> {
  try {
    const path = join(outDir, `debug-${label}.png`);
    await page.screenshot({ path, fullPage: true });
    console.error(`Wrote debug screenshot: ${path}`);
  } catch {
    /* ignore */
  }
}

async function detectCaptchaOrBlock(page: Page, outDir: string): Promise<void> {
  const url = page.url();
  if (/sorry|interstitial|challenge/i.test(url)) {
    await captureDebugShot(page, outDir, "blocked-url");
    throw new Error(
      "Google showed a block/challenge page (captcha or unusual traffic). Meet often does this for automated or datacenter IPs — try another network or a residential proxy."
    );
  }
  const blockedText = page.getByText(
    /unusual traffic|couldn't sign you in|verify you're not a robot|Try again later|Access denied/i
  );
  if (await blockedText.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await captureDebugShot(page, outDir, "blocked-text");
    throw new Error(
      "Google/Meet blocked this browser session (captcha, unusual traffic, or access denied). Common from Docker/cloud IPs."
    );
  }
  await throwIfMeetRejectedJoin(page, outDir);
}

/** Full-screen Meet error after Ask to join / knock — not fixable in code (host/policy/Google). */
async function throwIfMeetRejectedJoin(page: Page, outDir: string): Promise<void> {
  /** Do not match "meeting has ended" — that is normal when the host ends the call; see `meetingLooksEnded`. */
  const denied = page.getByText(
    /you can'?t join this video call|can'?t join this video call|unable to join this meeting|you can'?t join this meeting|access denied|call is full/i
  );
  if (await denied.first().isVisible({ timeout: 600 }).catch(() => false)) {
    await captureDebugShot(page, outDir, "meet-join-refused");
    throw new Error(
      "Meet refused this join (you may see 'You can't join this video call'). Common causes: host denied the knock, guest/quick access is off, meeting restricted to signed-in users, link expired, or Google blocked automation. Admit the bot from 'People waiting' or change Meet settings / try a fresh link."
    );
  }
}

async function assertNotSignInOnly(page: Page): Promise<void> {
  const signInRequired = page.getByText(
    /sign in to join|you need to sign in|only invited users can join/i
  );
  if (await signInRequired.isVisible({ timeout: 4000 }).catch(() => false)) {
    throw new Error(
      "Meet is asking for Google sign-in or restricted access — open guest joins in Meet settings or use a link that allows guests."
    );
  }
}

async function clickJoinAsGuestIfPresent(page: Page, onStatus?: (m: string) => void) {
  const patterns = [
    page.getByRole("button", { name: /join as guest|continue as guest/i }).first(),
    page.getByRole("link", { name: /join as guest|continue as guest/i }).first(),
  ];
  for (const loc of patterns) {
    if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
      onStatus?.("click_join_as_guest");
      await loc.click();
      await sleep(800);
      return;
    }
  }
}

/** Meet shows this when mic/camera are off — matches the fake-media bot flow. */
async function continueWithoutMediaIfPresent(page: Page, onStatus?: (m: string) => void) {
  const btn = page
    .getByRole("button", {
      name: /continue without microphone and camera|continue without mic|continue without/i,
    })
    .first();
  if (await btn.isVisible({ timeout: 6000 }).catch(() => false)) {
    onStatus?.("continue_without_media");
    await btn.click();
    await sleep(800);
  }
}

/** meetingbot: turn off mic/camera on pre-join so the real "Ask to join" enables reliably. */
async function muteMicAndCameraPrejoin(page: Page, onStatus?: (m: string) => void) {
  await sleep(200 + Math.floor(Math.random() * 300));
  await clickTurnOffMicAndCamera(page, onStatus, "prejoin_mute_mic", "prejoin_camera_off");
}

/**
 * Görüşdə: mikrofon/kamera aktivdirsə söndür (Meet hardware xəbərdarlıqlarını azaldır).
 * Pre-join ilə eyni selektorlar — "Turn off microphone" / "Turn off camera" yalnız aktiv olanda görünür.
 */
async function muteMicAndCameraInCall(page: Page, onStatus?: (m: string) => void) {
  await clickTurnOffMicAndCamera(page, onStatus, "incall_mute_mic", "incall_camera_off");
}

async function clickTurnOffMicAndCamera(
  page: Page,
  onStatus: ((m: string) => void) | undefined,
  micStatus: string,
  camStatus: string
) {
  for (const frame of page.frames()) {
    try {
      const mic = frame.locator(MEET_MUTE_MIC_SELECTOR).first();
      if (await mic.isVisible({ timeout: 400 }).catch(() => false)) {
        await mic.click({ timeout: 2000 }).catch(() => {});
        onStatus?.(micStatus);
        await sleep(200);
        break;
      }
    } catch {
      /* next frame */
    }
  }
  for (const frame of page.frames()) {
    try {
      const cam = frame.locator(MEET_CAMERA_OFF_SELECTOR).first();
      if (await cam.isVisible({ timeout: 400 }).catch(() => false)) {
        await cam.click({ timeout: 2000 }).catch(() => {});
        onStatus?.(camStatus);
        await sleep(200);
        break;
      }
    } catch {
      /* next frame */
    }
  }
}

/** "Microphone not found" / oxşar Meet toast-larını bağla (bütün frame-lər). */
async function dismissMeetMediaErrorToasts(page: Page, onStatus?: (m: string) => void) {
  const hint =
    /microphone not found|camera not found|make sure your microphone|microphone is blocked|camera is blocked|plugged in/i;
  for (const frame of page.frames()) {
    try {
      const alertBox = frame.getByRole("alert").filter({ hasText: hint }).first();
      if (!(await alertBox.isVisible({ timeout: 300 }).catch(() => false))) continue;
      const closeBtn = alertBox.locator('button[aria-label*="close" i]').first();
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ timeout: 1500 }).catch(() => {});
        onStatus?.("dismiss_meet_hardware_toast");
        return;
      }
    } catch {
      /* detached */
    }
  }
}

async function dismissCookies(page: Page, onStatus?: (m: string) => void) {
  try {
    const btn = page.getByRole("button", { name: /got it|accept all|i agree/i }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      onStatus?.("dismiss_cookie_banner");
      await btn.click();
    }
  } catch {
    /* ignore */
  }
}

/**
 * meetingbot `handleInfoPopup` — Meet shows modal dialogs (e.g. "Others might see you differently")
 * that block taps until dismissed. Try several times for stacked dialogs.
 */
async function dismissMeetInfoPopups(page: Page, onStatus?: (m: string) => void): Promise<void> {
  const xpathDialogs = [
    MEET_GOT_IT_XPATH,
    '//button[.//span[normalize-space()="OK"]]',
    '//button[.//span[normalize-space()="Ok"]]',
  ];
  for (let attempt = 0; attempt < 5; attempt++) {
    let clicked = false;
    for (const xp of xpathDialogs) {
      const loc = page.locator(`xpath=${xp}`).first();
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        onStatus?.("dismiss_meet_info_popup");
        await loc.click({ timeout: 6000 }).catch(() => {});
        clicked = true;
        await sleep(400);
        break;
      }
    }
    if (!clicked) {
      const role = page.getByRole("button", { name: /^got it$/i }).first();
      if (await role.isVisible({ timeout: 400 }).catch(() => false)) {
        onStatus?.("dismiss_meet_info_popup_role");
        await role.click({ timeout: 6000 }).catch(() => {});
        clicked = true;
        await sleep(400);
      }
    }
    if (!clicked) break;
  }
}

/**
 * Pre-join name: meetingbot uses `input[type="text"][aria-label="Your name"]` + `fill()`.
 * We try that first, then iframes and fallbacks for React / locale variants.
 */
async function enterGuestName(page: Page, name: string, onStatus?: (m: string) => void) {
  const trimmed = name.trim();
  if (!trimmed) return;

  try {
    await page.waitForSelector(MEET_GUEST_NAME_INPUT, { state: "visible", timeout: 25_000 });
  } catch {
    await page
      .getByText(/what'?s your name|your name/i)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
  }
  await sleep(400 + Math.floor(Math.random() * 500));

  const primary = page.locator(MEET_GUEST_NAME_INPUT).first();
  if (await primary.isVisible({ timeout: 3000 }).catch(() => false)) {
    onStatus?.("fill_guest_name_meetingbot_aria");
    await primary.scrollIntoViewIfNeeded().catch(() => {});
    await primary.click({ timeout: 8000 }).catch(() => {});
    await primary.fill(trimmed, { timeout: 10_000 });
    await sleep(400);
    if (await nameFieldLooksFilled(page, trimmed)) return;
    await primary.click({ timeout: 3000 }).catch(() => {});
    try {
      await primary.clear({ timeout: 3000 });
    } catch {
      /* ignore */
    }
    try {
      await primary.pressSequentially(trimmed, { delay: 40, timeout: 30_000 });
    } catch {
      await page.keyboard.type(trimmed, { delay: 35 });
    }
    await sleep(400);
    if (await nameFieldLooksFilled(page, trimmed)) return;
  }

  if (await tryTypeNameAllFrames(page, trimmed, onStatus)) return;

  const tryFillLocator = async (loc: Locator, tag: string): Promise<boolean> => {
    const el = loc.first();
    if (!(await el.isVisible({ timeout: 3500 }).catch(() => false))) return false;
    onStatus?.(`fill_guest_name_${tag}`);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ timeout: 8000 }).catch(() => {});
    await el.clear().catch(() => {});
    await el.fill(trimmed, { timeout: 8000 }).catch(() => {});
    await el.press("Tab").catch(() => {});
    await sleep(250);
    if (await nameFieldLooksFilled(page, trimmed)) return true;
    await el.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
    try {
      await el.pressSequentially(trimmed, { delay: 40, timeout: 30_000 });
    } catch {
      await page.keyboard.type(trimmed, { delay: 35 });
    }
    await page.keyboard.press("Tab");
    await sleep(400);
    return await nameFieldLooksFilled(page, trimmed);
  };

  const candidates: Array<{ loc: Locator; tag: string }> = [
    { loc: page.locator(MEET_GUEST_NAME_INPUT), tag: "aria_label_your_name_repeat" },
    { loc: page.getByRole("textbox", { name: /your name|what'?s your name|name/i }), tag: "textbox_role" },
    { loc: page.getByPlaceholder(/^your name$/i), tag: "placeholder_exact" },
    { loc: page.getByPlaceholder(/your name|display name|name/i), tag: "placeholder" },
    { loc: page.locator('input[placeholder="Your name"]'), tag: "placeholder_attr" },
    { loc: page.locator('input[placeholder*="name" i]'), tag: "placeholder_star" },
    { loc: page.locator('input[aria-label*="name" i]'), tag: "aria_label" },
    { loc: page.locator('input[type="text"]'), tag: "input_text" },
  ];

  for (const { loc, tag } of candidates) {
    if (await tryFillLocator(loc, tag)) return;
  }

  const ce = page.locator('[contenteditable="true"]').first();
  if (await ce.isVisible({ timeout: 3000 }).catch(() => false)) {
    onStatus?.("fill_guest_name_contenteditable");
    await ce.click({ timeout: 5000 });
    await ce.fill(trimmed);
    await page.keyboard.press("Tab");
    await sleep(300);
    if (await nameFieldLooksFilled(page, trimmed)) return;
  }

  onStatus?.("fill_guest_name_dom_fallback");
  const injected = await fillNameViaDom(page, trimmed);
  if (injected) await sleep(500);
}

/** Meet prejoin can live in a child frame; search each frame for the name field. */
async function tryTypeNameAllFrames(
  page: Page,
  trimmed: string,
  onStatus?: (m: string) => void
): Promise<boolean> {
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const locators: Locator[] = [
      frame.locator(MEET_GUEST_NAME_INPUT),
      frame.getByPlaceholder(/^your name$/i),
      frame.getByPlaceholder(/your name/i),
      frame.locator('input[placeholder="Your name"]'),
      frame.locator('input[placeholder*="name" i]'),
      frame.locator('input[type="text"]').first(),
    ];
    for (const loc of locators) {
      const el = loc.first();
      if (!(await el.isVisible({ timeout: 1200 }).catch(() => false))) continue;
      onStatus?.(`fill_guest_name_frame_${i}_pressSeq`);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click({ force: true, timeout: 5000 }).catch(() => {});
      await el.clear().catch(() => {});
      try {
        await el.pressSequentially(trimmed, { delay: 45, timeout: 60_000 });
      } catch {
        await page.keyboard.type(trimmed, { delay: 40 });
      }
      await sleep(350);
      if (await nameFieldLooksFilled(page, trimmed)) return true;
    }
  }
  return false;
}

async function nameFieldLooksFilled(page: Page, name: string): Promise<boolean> {
  const counterRe = new RegExp(`${name.length}/\\d+`);
  if (await page.getByText(counterRe).first().isVisible({ timeout: 800 }).catch(() => false)) {
    return true;
  }
  const joinBtn = page
    .locator('button:not([data-promo-anchor-id])')
    .filter({ hasText: /ask to join/i })
    .first();
  if (await joinBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    return await joinBtn.isEnabled();
  }
  return false;
}

async function fillNameViaDom(page: Page, name: string): Promise<boolean> {
  return page.evaluate((guestName) => {
    function collectInputs(root: Document | ShadowRoot | Element): HTMLInputElement[] {
      const list: HTMLInputElement[] = [];
      root.querySelectorAll("input").forEach((n) => {
        if (n instanceof HTMLInputElement) list.push(n);
      });
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          list.push(...collectInputs(el.shadowRoot));
        }
      });
      return list;
    }

    function setReactValue(el: HTMLInputElement, value: string): void {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      const setter = proto?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const inputs = collectInputs(document);
    const target =
      inputs.find((i) => i.getAttribute("aria-label") === "Your name") ||
      inputs.find((i) => /your name/i.test(i.placeholder || "")) ||
      inputs.find((i) => i.type === "text" && i.offsetParent !== null && i.placeholder !== undefined) ||
      inputs.find((i) => i.type === "text" && i.offsetParent !== null);

    if (!target) return false;
    target.focus();
    target.click();
    setReactValue(target, guestName);
    return true;
  }, name);
}

/**
 * Pre-join "Join now" / "Ask to join" often live in the same iframe as the guest name field, not the main document.
 */
function watchJoinControlsAppear(frame: Frame, raceTimeout: number): Promise<Frame> {
  return Promise.race([
    frame
      .locator(`xpath=${MEET_JOIN_NOW_XPATH}`)
      .first()
      .waitFor({ state: "visible", timeout: raceTimeout })
      .then(() => frame),
    frame
      .locator(`xpath=${MEET_ASK_TO_JOIN_XPATH}`)
      .first()
      .waitFor({ state: "visible", timeout: raceTimeout })
      .then(() => frame),
  ]);
}

/**
 * meetingbot: `Promise.race` on Join now / Ask to join XPaths, then click when enabled.
 * Searches every frame — Meet often renders pre-join UI only in an iframe.
 */
async function clickMeetingbotJoinRace(
  page: Page,
  overallDeadline: number,
  isCancelled?: () => Promise<boolean>
): Promise<boolean> {
  const msLeft = overallDeadline - Date.now();
  const raceTimeout = Math.min(90_000, Math.max(3000, msLeft));
  let joinFrame: Frame;
  try {
    joinFrame = await Promise.any(
      page.frames().map((frame) => watchJoinControlsAppear(frame, raceTimeout))
    );
  } catch {
    return false;
  }

  const joinNow = joinFrame.locator(`xpath=${MEET_JOIN_NOW_XPATH}`).first();
  const ask = joinFrame.locator(`xpath=${MEET_ASK_TO_JOIN_XPATH}`).first();
  while (Date.now() < overallDeadline) {
    await throwIfCancelled(isCancelled);
    if ((await joinNow.isVisible().catch(() => false)) && (await joinNow.isEnabled())) {
      await joinNow.click({ timeout: 25_000 });
      return true;
    }
    if ((await ask.isVisible().catch(() => false)) && (await ask.isEnabled())) {
      await ask.click({ timeout: 25_000 });
      return true;
    }
    await sleepWithCancel(400, isCancelled);
  }
  return false;
}

async function clickJoinOrAsk(
  page: Page,
  onStatus?: (m: string) => void,
  isCancelled?: () => Promise<boolean>
) {
  const namePatterns = [
    /ask to join/i,
    /join now/i,
    /^join$/i,
    /switch here to join/i,
    /ask to join this call/i,
    /teilnehmen|beitreten|rejoindre/i,
  ];
  const deadline = Date.now() + config.joinTimeoutSeconds * 1000;
  let lastDisabledLog = 0;

  onStatus?.("join_click_meetingbot_race");
  if (await clickMeetingbotJoinRace(page, deadline, isCancelled)) {
    onStatus?.("click_join_meetingbot_race_ok");
    return;
  }

  while (Date.now() < deadline) {
    await throwIfCancelled(isCancelled);
    if (await tryClickEnabledJoinButton(page, namePatterns, onStatus, () => {
      const now = Date.now();
      if (now - lastDisabledLog > 8000) {
        lastDisabledLog = now;
        onStatus?.("join_button_disabled_check_name_field");
      }
    })) {
      return;
    }
    await sleepWithCancel(400, isCancelled);
  }
  throw new Error(
    "Could not click an enabled Join / Ask to join within JOIN_TIMEOUT_SECONDS — enter a guest name in Meet, or check UI language / automation blocking."
  );
}

/**
 * Meet keeps "Ask to join" disabled until a valid name is entered; clicking while disabled times out.
 * Exclude `data-promo-anchor-id` — those are promos, not the real join control (host never sees a knock).
 */
async function tryClickEnabledJoinButton(
  page: Page,
  namePatterns: RegExp[],
  onStatus?: (m: string) => void,
  onVisibleDisabled?: () => void
): Promise<boolean> {
  /** meetingbot: primary join CTAs are `<button><span>Ask to join</span></button>` — hasText on button can miss. */
  const xpathPrimary = (frame: Frame) => [
    frame.locator(`xpath=${MEET_JOIN_NOW_XPATH}`),
    frame.locator(`xpath=${MEET_ASK_TO_JOIN_XPATH}`),
  ];

  for (const frame of page.frames()) {
    try {
      for (const btn of xpathPrimary(frame)) {
        if (!(await btn.isVisible({ timeout: 400 }).catch(() => false))) continue;
        if (!(await btn.isEnabled())) {
          onVisibleDisabled?.();
          continue;
        }
        onStatus?.("click_join_meetingbot_span_button");
        await btn.click({ timeout: 25_000 });
        return true;
      }
    } catch {
      /* detached frame */
    }
  }

  const realControl =
    'button:not([data-promo-anchor-id]), [role="button"]:not([data-promo-anchor-id])';

  for (const frame of page.frames()) {
    try {
      for (const re of namePatterns) {
        const realButtons = frame.locator(realControl).filter({ hasText: re });
        const count = await realButtons.count();
        for (let i = 0; i < count; i++) {
          const btn = realButtons.nth(i);
          if (!(await btn.isVisible({ timeout: 400 }).catch(() => false))) continue;
          if (!(await btn.isEnabled())) {
            onVisibleDisabled?.();
            continue;
          }
          onStatus?.("click_join_real_button");
          await btn.click({ timeout: 25_000 });
          return true;
        }
      }

      const anyJoin = frame
        .locator(realControl)
        .filter({ hasText: /^(ask to join|join now|join)$/i })
        .first();
      if (await anyJoin.isVisible({ timeout: 400 }).catch(() => false)) {
        if (!(await anyJoin.isEnabled())) {
          onVisibleDisabled?.();
          continue;
        }
        onStatus?.("click_join_real_button");
        await anyJoin.click({ timeout: 25_000 });
        return true;
      }
    } catch {
      /* detached frame */
    }
  }

  return false;
}

/** After clicking join, confirm we left the pre-join screen (waiting room or in-call). */
async function waitForWaitingRoomOrCall(
  page: Page,
  outDir: string,
  onStatus?: (m: string) => void,
  isCancelled?: () => Promise<boolean>
): Promise<void> {
  const leaveCallBtn = page.locator(`xpath=${MEET_LEAVE_CALL_XPATH}`);
  const waiting = page.getByText(
    /waiting for the host|waiting to join|in the waiting room|asking to join|the host will let you in|you'?re waiting|knocking|request sent/i
  );
  /** Do not match "Return to home screen" alone — same text appears on "You can't join this video call". */
  const inCall = page.getByText(
    /leave call|^people$|people \(\d|you'?re in|in this call|turn off microphone|microphone is off|camera is off|redistribute|meeting details/i
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await throwIfCancelled(isCancelled);
    await throwIfMeetRejectedJoin(page, outDir);
    if (await leaveCallBtn.isVisible({ timeout: 400 }).catch(() => false)) {
      onStatus?.("meet_in_call_leave_button");
      return;
    }
    if (await waiting.first().isVisible({ timeout: 400 }).catch(() => false)) {
      onStatus?.("meet_waiting_room_visible_host_should_see_knock");
      return;
    }
    if (await inCall.first().isVisible({ timeout: 400 }).catch(() => false)) {
      onStatus?.("meet_in_call_ui");
      return;
    }
    await sleepWithCancel(400, isCancelled);
  }
  onStatus?.("meet_post_join_timeout_check_recording");
  await captureDebugShot(page, outDir, "post-join-no-waiting-ui");
}

type WaitInMeetingResult = {
  /** Linux x11 only: true=ffmpeg ran with pulse demuxer, false=fell back to video-only, undefined=not used. */
  pulseAudioMuxed: boolean | undefined;
  /** Linux x11 only: true once ffmpeg observed real audio packets (Stream mapping + non-zero time). */
  audioPacketsSeen: boolean | undefined;
};

async function waitInMeeting(
  page: Page,
  outDir: string,
  onStatus?: (m: string) => void,
  isCancelled?: () => Promise<boolean>
): Promise<WaitInMeetingResult> {
  const maxMs = config.meetingMaxSeconds * 1000;
  const started = Date.now();
  onStatus?.("recording");
  await dismissMeetInfoPopups(page, onStatus);
  await applyMeetRecordingUiChrome(page, onStatus);
  await dismissMeetMediaErrorToasts(page, onStatus);
  await muteMicAndCameraInCall(page, onStatus);

  let stopX11Desktop: (() => Promise<void>) | undefined;
  let stopPulseSidecar: (() => Promise<void>) | undefined;
  const desk = await startLinuxX11PulseRecording(
    outDir,
    (m) => onStatus?.(m),
    (m) => console.error(m)
  );
  /** Pass to caller so worker logs match reality when ffmpeg lacks pulse and falls back to silent video-only. */
  let desktopPulseMuxed: boolean | undefined;
  let desktopAudioFlowed: (() => boolean) | undefined;
  if (desk) {
    desktopPulseMuxed = desk.pulseAudioMuxed;
    desktopAudioFlowed = desk.audioPacketsSeen;
    stopX11Desktop = desk.stop;
    onStatus?.("recording_x11_desktop_ffmpeg_started");
    if (
      desk.pulseAudioMuxed &&
      config.meetArtifactSeparateAudio
    ) {
      const side = await startLinuxPulseSidecarRecording(
        outDir,
        (m) => onStatus?.(m),
        (m) => console.error(m)
      );
      if (side) {
        stopPulseSidecar = side.stop;
        onStatus?.("recording_pulse_sidecar_started");
      }
    }
  }

  const artifactEnabled = config.meetArtifactChat;
  const artifactState = createArtifactState(started);

  /** Tracks that we saw in-call chrome; then if Leave call disappears, scrape text (Meet often hides locators Playwright would use). */
  let sawInCallLeaveControl = false;
  let pollsWithoutLeaveControl = 0;
  let lastHardwareToastDismiss = 0;

  try {
  while (Date.now() - started < maxMs) {
    await throwIfCancelled(isCancelled);
    const nowLoop = Date.now();
    if (nowLoop - lastHardwareToastDismiss >= 12_000) {
      lastHardwareToastDismiss = nowLoop;
      await dismissMeetMediaErrorToasts(page, onStatus).catch(() => {});
    }
    if (artifactEnabled) {
      await tickMeetingArtifacts(page, outDir, artifactState, onStatus).catch(
        () => {}
      );
    }
    const leaveVisible = await page
      .locator(`xpath=${MEET_LEAVE_CALL_XPATH}`)
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false);
    if (leaveVisible) {
      sawInCallLeaveControl = true;
      pollsWithoutLeaveControl = 0;
    } else if (sawInCallLeaveControl) {
      pollsWithoutLeaveControl++;
    }

    if (await meetingLooksEnded(page)) {
      onStatus?.("meeting_ui_left_or_ended");
      break;
    }

    if (
      sawInCallLeaveControl &&
      pollsWithoutLeaveControl >= config.meetingLeaveGonePolls &&
      (await meetingLooksEndedByLeaveControlLost(page))
    ) {
      onStatus?.("meeting_ui_leave_control_gone_end_detected");
      break;
    }

    await throwIfMeetRejectedJoin(page, outDir);
    await sleepWithCancel(config.meetingEndPollMs, isCancelled);
  }
  } finally {
    /** Runs on normal exit, timeout, and cancel — final chat scrape. */
    if (artifactEnabled) {
      await finalizeMeetingArtifacts(page, outDir, artifactState, onStatus).catch(
        () => {}
      );
    }
    if (stopX11Desktop) {
      onStatus?.("recording_x11_desktop_ffmpeg_stopping");
      await stopX11Desktop().catch(() => {});
    }
    if (stopPulseSidecar) {
      onStatus?.("recording_pulse_sidecar_stopping");
      await stopPulseSidecar().catch(() => {});
    }
  }

  const audioPacketsSeen =
    desktopPulseMuxed === undefined
      ? undefined
      : desktopAudioFlowed?.() ?? false;
  if (desktopPulseMuxed === true) {
    onStatus?.(
      audioPacketsSeen
        ? "recording_x11_desktop_audio_flow_ok"
        : "recording_x11_desktop_audio_flow_missing"
    );
  }
  return { pulseAudioMuxed: desktopPulseMuxed, audioPacketsSeen };
}

/** Visible text from `document.body.innerText` — catches end-of-call copy `getByText` often misses. */
async function getMeetBodyInnerText(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const el = document.body;
      if (!el) return "";
      return (el.innerText ?? "").slice(0, 16_000);
    })
    .catch(() => "");
}

/** Strong signals when host ends meeting or you leave (English Meet). */
const MEET_END_STRONG_TEXT =
  /the meeting has ended|this meeting has ended|meeting has ended|the meeting is over|host ended (the )?meeting|the host ended|ended for everyone|you left the meeting|you'?ve left the (call|meeting)|you left the call|return to home screen|\breturn to home\b|thanks for joining|you will be returned to the home screen|you'?ll return to the home screen|you'?ve been removed from the meeting|removed from this meeting|call ended|no longer in this call|going home|ready to join another meeting/i;

async function meetingLooksEndedByLeaveControlLost(page: Page): Promise<boolean> {
  const blob = await getMeetBodyInnerText(page);
  if (/leave call/i.test(blob)) return false;
  return MEET_END_STRONG_TEXT.test(blob);
}

/**
 * Meet end-of-call UI varies by reason (you left, host ended for everyone, link expired, etc.).
 * Prefer full-page text scan; Playwright locators often fail on Meet's DOM updates.
 */
async function meetingLooksEnded(page: Page): Promise<boolean> {
  const blob = await getMeetBodyInnerText(page);
  if (blob.length > 0 && MEET_END_STRONG_TEXT.test(blob)) {
    return true;
  }

  const textSignals: RegExp[] = [
    /return to home screen/i,
    /return to home\b/i,
    /you left the meeting/i,
    /you'?ve left the (call|meeting)/i,
    /the meeting has ended/i,
    /this meeting has ended/i,
    /meeting has ended/i,
    /the meeting is over/i,
    /call ended/i,
    /the host ended the meeting/i,
    /host ended (the )?meeting/i,
    /meeting ended for everyone/i,
    /thanks for joining/i,
    /you will be returned to the home screen/i,
    /you'?ve been removed from the meeting/i,
  ];

  for (const re of textSignals) {
    const loc = page.getByText(re).first();
    if (await loc.isVisible({ timeout: 350 }).catch(() => false)) return true;
  }

  const buttons = [
    page.getByRole("button", { name: /return to home/i }),
    page.getByRole("button", { name: /^rejoin$/i }),
    page.getByRole("button", { name: /rejoin the meeting/i }),
  ];
  for (const b of buttons) {
    if (await b.isVisible({ timeout: 350 }).catch(() => false)) return true;
  }

  if (await page.getByText(/\brejoin\b/i).first().isVisible({ timeout: 350 }).catch(() => false)) {
    return true;
  }

  return false;
}

type FindRecordedVideoOpts = {
  /** After cancel: accept smaller meet-desktop.mp4 (partial x11 output). */
  cancelled?: boolean;
};

async function findRecordedVideo(
  dir: string,
  opts?: FindRecordedVideoOpts
): Promise<string> {
  const minDesktopBytes = opts?.cancelled ? 256 : 4000;
  const files = await readdir(dir);
  if (files.includes("meet-desktop.mp4")) {
    const p = join(dir, "meet-desktop.mp4");
    const st = await stat(p).catch(() => null);
    if (st && st.size > minDesktopBytes) return p;
  }
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) {
    throw new Error(
      "No recording produced (expected meet-desktop.mp4 for MEET_LINUX_RECORD_MODE=x11, or a Playwright .webm)"
    );
  }
  return join(dir, webm);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throwIfCancelled(isCancelled?: () => Promise<boolean>): Promise<void> {
  if (isCancelled && (await isCancelled())) {
    throw new MeetRecordingCancelledError();
  }
}

/** Like `sleep` but aborts when API cancel is requested (chunks so cancel is responsive). */
async function sleepWithCancel(ms: number, isCancelled?: () => Promise<boolean>): Promise<void> {
  const chunk = 400;
  let elapsed = 0;
  while (elapsed < ms) {
    await throwIfCancelled(isCancelled);
    const step = Math.min(chunk, ms - elapsed);
    await new Promise<void>((resolve) => setTimeout(resolve, step));
    elapsed += step;
  }
}
