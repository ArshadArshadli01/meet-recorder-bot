/**
 * MeetingBot-style Chromium: playwright-extra + stealth plugin + launch flags aligned with
 * {@link https://github.com/meetingbot/meetingbot meetingbot} MeetsBot.
 */
import { chromium as chromiumExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { chromium as chromiumVanilla } from "playwright";
import { config } from "./config.js";

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromiumExtra.use(stealthPlugin);

export function getMeetChromium() {
  return config.meetStealth ? chromiumExtra : chromiumVanilla;
}

/**
 * Matches meetingbot `browserArgs` where possible; keeps fake-media behavior for Windows vs Linux.
 */
export function buildMeetLaunchArgs(): string[] {
  const w = config.videoWidth;
  const h = config.videoHeight;
  const args = [
    "--incognito",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-infobars",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    `--window-size=${w},${h}`,
  ];

  if (!config.meetUseFakeMedia) {
    return withRecordingChromeArgs(args);
  }

  /**
   * Sintetik kamera + mikrofon (Chrome test pattern / sine). İcazə dialoqu avtomatik qəbul olunur.
   * Əvvəl Linux-da `/dev/null` fayl ilə saxta capture istifadə olunurdu — Meet tez-tez
   * "Microphone not found" toast göstərirdi; `use-fake-device-for-media-stream` bütün OS-də etibarlıdır.
   */
  args.push(
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream"
  );

  return withRecordingChromeArgs(args);
}

/**
 * Tabs and the address bar are **browser chrome**, not the page — `F11` / `requestFullscreen()` in the page
 * cannot remove them. For x11grab (full desktop), use Chromium kiosk or start-fullscreen at **launch**.
 *
 * Note: `--start-maximized` and `--start-fullscreen` together are inconsistent on Linux + fluxbox — Chromium
 * sometimes maximizes (with chrome) instead of fullscreening (no chrome). Use only `--start-fullscreen` plus
 * `--window-position=0,0` and `--window-size=W,H` so the window covers the entire Xvfb display from boot.
 */
function withRecordingChromeArgs(args: string[]): string[] {
  if (!config.meetRecordingFullscreen || config.headless) {
    return args;
  }
  if (config.meetRecordingKiosk) {
    args.push("--kiosk");
  } else {
    args.push("--start-fullscreen", "--window-position=0,0");
  }
  return args;
}
