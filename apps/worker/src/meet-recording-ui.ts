import { spawn } from "node:child_process";
import type { Page } from "playwright";
import { config } from "./config.js";

/**
 * CSS injection cannot track Meet's frequent DOM churn — combine with MEET_RECORDING_CROP_BOTTOM_PX in ffmpeg
 * to reliably drop the bottom bar from x11 captures.
 */
const MEET_HIDE_CONTROLS_CSS = `
body.meet-bot-rec-ui [role="toolbar"],
body.meet-bot-rec-ui nav[aria-label*="Meeting"] ~ div[style*="fixed"],
body.meet-bot-rec-ui div[data-call-ended] ~ div[style*="bottom"]:not([role="dialog"]),
body.meet-bot-rec-ui div[jscontroller][style*="position: fixed"][style*="bottom"] {
  opacity: 0 !important;
  pointer-events: none !important;
  max-height: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
}
`;

/**
 * `page.keyboard.press("F11")` is delivered through DevTools and **does not** trigger Chromium's
 * browser-level fullscreen shortcut — that is the "F11 button not clicked" symptom. Sending the
 * keystroke through `xdotool key F11` injects it via the X server, so fluxbox + Chromium handle
 * it as a real user keypress and toggle fullscreen reliably.
 */
function pressF11ViaXdotool(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== "linux") {
      resolve(false);
      return;
    }
    const proc = spawn("xdotool", ["key", "--clearmodifiers", "F11"], {
      stdio: "ignore",
      windowsHide: true,
    });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * Hides Meet in-call toolbars (CSS) and forces the browser into OS fullscreen via `xdotool key F11`
 * (Linux only — Playwright's keyboard.press("F11") never fires the browser-level shortcut).
 *
 * Browser tabs/URL bar removal at launch is handled by `--start-fullscreen` in `buildMeetLaunchArgs`;
 * F11 here is a belt-and-braces step in case fluxbox ignored the launch flag for any reason.
 */
export async function applyMeetRecordingUiChrome(
  page: Page,
  onStatus?: (m: string) => void
): Promise<void> {
  try {
    if (config.meetHideMeetControlsCss) {
      await page.addStyleTag({ content: MEET_HIDE_CONTROLS_CSS }).catch(() => {});
      await page
        .evaluate(() => document.body.classList.add("meet-bot-rec-ui"))
        .catch(() => {});
      onStatus?.("recording_ui_hide_controls_css");
    }

    if (config.meetRecordingFullscreen && !config.headless) {
      await page.bringToFront().catch(() => {});
      const ok = await pressF11ViaXdotool();
      onStatus?.(
        ok ? "recording_ui_xdotool_f11" : "recording_ui_xdotool_f11_skipped"
      );
      await new Promise((r) => setTimeout(r, 700));
      await page
        .evaluate(() => {
          const el = document.documentElement;
          if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
        })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch {
    /* non-fatal — Meet still works without fullscreen */
  }
}
