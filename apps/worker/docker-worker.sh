#!/bin/sh
# meet-bot worker container — modeled after meetingbot-main-helper src/bots/meet/entrypoint.sh:
# start Xvfb + PulseAudio in the background, then exec node so PID 1 logs flow to `docker logs`.
# xvfb-run can swallow or detach stdout on some Docker Desktop setups; plain Xvfb avoids that.
#
# Idempotent :99 — if the entrypoint runs again while Xvfb is already up (or a second start races),
# do not fail; reuse the working display. Requires xdpyinfo (package x11-utils) for a reliable check.
set -eu
cd /app

log() {
  printf '%s\n' "$*"
}

log "[meet-bot-worker] entrypoint pid=$$ shell=$0"

# meetingbot meet entrypoint: PulseAudio/XDG expectations in minimal containers
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-meetbot}"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true

# Pulse clients + pactl agree on the same runtime dir (meet-teams-bot uses PULSE_RUNTIME_PATH similarly).
export PULSE_RUNTIME_PATH="${PULSE_RUNTIME_PATH:-${XDG_RUNTIME_DIR}/pulse}"
mkdir -p "$PULSE_RUNTIME_PATH"

export DISPLAY=:99

# Match meetingbot `MeetsBot` (`meetingbot-main-helper/src/bots/meet/src/bot.ts`): SCREEN 1920×1080 and same Xvfb size.
VIDEO_WIDTH="${VIDEO_WIDTH:-1920}"
VIDEO_HEIGHT="${VIDEO_HEIGHT:-1080}"
export VIDEO_WIDTH VIDEO_HEIGHT

# True if something is listening on the Unix socket for :99 (best-effort without xdpyinfo).
display_socket_ready() {
  [ -S /tmp/.X11-unix/X99 ]
}

# True if we can talk to the X server (preferred).
display_responds() {
  if command -v xdpyinfo >/dev/null 2>&1; then
    xdpyinfo -display ":99" >/dev/null 2>&1
  else
    display_socket_ready
  fi
}

# Wait up to ~5s for the display (slow CI / busy host).
wait_for_display() {
  _i=0
  while [ "$_i" -lt 50 ]; do
    if display_responds; then
      return 0
    fi
    _i=$((_i + 1))
    sleep 0.1
  done
  return 1
}

if display_responds; then
  log "[meet-bot-worker] X display :99 already usable — skipping Xvfb"
else
  # Stale /tmp/.X99-lock or socket after crash/restart → "Server is already active for display 99".
  if [ -f /tmp/.X99-lock ] || [ -e /tmp/.X11-unix/X99 ]; then
    log "[meet-bot-worker] clearing stale X :99 lock/socket before starting Xvfb"
    rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
  fi
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "Xvfb :99" 2>/dev/null || true
    sleep 0.4
  fi
  log "[meet-bot-worker] starting Xvfb DISPLAY=:99 screen=${VIDEO_WIDTH}x${VIDEO_HEIGHT} (meetingbot: 1920x1080x24)"
  # xkbcomp may warn about unresolved XF86* keysyms on minimal keymaps — harmless (see X log "not fatal").
  Xvfb :99 -screen 0 "${VIDEO_WIDTH}x${VIDEO_HEIGHT}x24" -ac +extension RANDR -nolisten tcp &
  XVFB_PID=$!
  sleep 1
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    if display_responds; then
      log "[meet-bot-worker] new Xvfb exited but :99 is active — reusing existing display"
    elif wait_for_display; then
      log "[meet-bot-worker] X display :99 became ready after Xvfb exited (reuse)"
    else
      log "[meet-bot-worker] ERROR: Xvfb did not stay up and display :99 is not available"
      exit 1
    fi
  else
    if ! wait_for_display; then
      log "[meet-bot-worker] ERROR: timed out waiting for X display :99 after starting Xvfb"
      exit 1
    fi
  fi
fi

# meetingbot meet/entrypoint.sh — lightweight WM so Chromium can maximize and fill the virtual screen (fullscreen-like capture).
if command -v fluxbox >/dev/null 2>&1; then
  log "[meet-bot-worker] starting fluxbox (meetingbot meet/entrypoint.sh)"
  fluxbox >/dev/null 2>&1 &
  sleep 1
else
  log "[meet-bot-worker] WARN: fluxbox not installed — browser may not fill Xvfb (install fluxbox in Dockerfile)"
fi

log "[meet-bot-worker] starting PulseAudio"
pulseaudio -D --exit-idle-time=-1 --disallow-exit 2>/dev/null || true

sleep 1

if ! command -v pactl >/dev/null 2>&1; then
  log "[meet-bot-worker] ERROR: pactl missing — cannot set up Pulse routing for Meet audio"
  exit 1
fi

# Reset Pulse stream-restore so old per-app routing is forgotten (otherwise Chromium can keep
# remembering an old default sink even after we re-route). restore_device=false makes the new
# default sink stick for every stream Chromium opens after this script runs.
pactl unload-module module-stream-restore 2>/dev/null || true
if pactl load-module module-stream-restore restore_device=false >/dev/null 2>&1; then
  log "[meet-bot-worker] reset module-stream-restore restore_device=false"
else
  log "[meet-bot-worker] WARN: failed to reload module-stream-restore — continuing"
fi

# meet-teams-bot style: virtual speaker sink + monitor source for ffmpeg recording.
# Loud-fail when monitor never appears so silent recordings stop being a mystery.
log "[meet-bot-worker] PulseAudio null sink for browser playback (meet-teams-bot style)"
SINK_LOAD_OUT=$(pactl load-module module-null-sink sink_name=meet_bot_sink \
  sink_properties=device.description=MeetBotPlayback 2>&1 || true)
if printf '%s' "$SINK_LOAD_OUT" | grep -qi "fail\|error"; then
  log "[meet-bot-worker] ERROR: module-null-sink load failed: $SINK_LOAD_OUT"
  exit 1
fi
log "[meet-bot-worker] module-null-sink loaded (id=$SINK_LOAD_OUT)"

pactl set-default-sink meet_bot_sink 2>/dev/null || true
pactl set-sink-volume meet_bot_sink 100% 2>/dev/null || true

# Wait up to ~5s for the monitor source to register (slow CI / busy host).
_i=0
while [ "$_i" -lt 50 ]; do
  if pactl list sources short 2>/dev/null | grep -q "meet_bot_sink.monitor"; then
    break
  fi
  _i=$((_i + 1))
  sleep 0.1
done
if ! pactl list sources short 2>/dev/null | grep -q "meet_bot_sink.monitor"; then
  log "[meet-bot-worker] ERROR: meet_bot_sink.monitor never appeared — Pulse routing broken; aborting"
  pactl list short modules 2>/dev/null | sed 's/^/[pa-modules] /' || true
  exit 1
fi
log "[meet-bot-worker] meet_bot_sink.monitor available"

# Bind every child process (Chromium, ffmpeg) to the same sink + monitor regardless of any
# default-sink race. PULSE_SINK/PULSE_SOURCE are honored by libpulse clients; MEET_PULSE_SOURCE
# is read by src/config.ts and pinned here so .env / compose drift cannot win.
export PULSE_SINK="meet_bot_sink"
export PULSE_SOURCE="meet_bot_sink.monitor"
export MEET_PULSE_SOURCE="meet_bot_sink.monitor"
log "[meet-bot-worker] PULSE_SINK=$PULSE_SINK PULSE_SOURCE=$PULSE_SOURCE MEET_PULSE_SOURCE=$MEET_PULSE_SOURCE"

# meetingbot entrypoint waits for display + PA to settle
sleep 2

# Stamp the build version so `docker logs` shows when the running container was built.
if [ -f /app/BUILD_INFO.json ]; then
  log "[meet-bot-worker] BUILD_INFO: $(cat /app/BUILD_INFO.json)"
else
  log "[meet-bot-worker] BUILD_INFO: (missing /app/BUILD_INFO.json)"
fi

log "[meet-bot-worker] exec node dist/worker.js (logs should follow)"
exec stdbuf -oL -eL node dist/worker.js
