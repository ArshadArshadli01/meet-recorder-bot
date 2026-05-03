# meet-bot worker — Playwright + Xvfb + PulseAudio + system ffmpeg.
#
# Self-contained: build context is just `apps/worker/`. A client can copy this
# folder, run `docker build -t my-meet-worker .`, and have a worker that
# consumes BullMQ jobs from any compatible Redis (see README.md).
#
# Base image rationale (carried over from the legacy root Dockerfile):
#   - Official Playwright Ubuntu image — keeps Chromium + system libs in sync
#     with the Playwright pin (`playwright@1.59.1`).
#   - Debian's slim apt ffmpeg often **omits** the PulseAudio demuxer; Ubuntu's
#     ffmpeg + libpulse keeps Linux x11grab+pulse recording from going silent.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Do NOT set NODE_ENV=production before `npm install` — npm omits devDependencies
# (typescript, tsx) and `npm run build` fails with `tsc: not found`.

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    xvfb xauth x11-utils x11-xserver-utils fluxbox xdotool \
    pulseaudio pulseaudio-utils coreutils ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -formats 2>&1 | grep -qi pulse \
  || (echo "ERROR: ffmpeg must include Pulse input (pulse demuxer). Use the Ubuntu base image so Pulse is available." && ffmpeg -formats 2>&1 | head -40 && exit 1)

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund \
  && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

ENV NODE_ENV=production

COPY docker-worker.sh /usr/local/bin/docker-worker.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-worker.sh \
  && chmod +x /usr/local/bin/docker-worker.sh

ARG GIT_SHA=unknown
ARG BUILD_IMAGE=meet-bot-worker:dev
RUN BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  && printf '{"buildTime":"%s","gitSha":"%s","image":"%s"}\n' \
       "$BUILD_TIME" "$GIT_SHA" "$BUILD_IMAGE" > /app/BUILD_INFO.json \
  && cat /app/BUILD_INFO.json

CMD ["/usr/local/bin/docker-worker.sh"]
