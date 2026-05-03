# meet-bot API — Fastify HTTP server. Self-contained: builds against its own
# package.json + tsconfig.json without referencing packages/core or other apps.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

ARG GIT_SHA=unknown
ARG BUILD_IMAGE=meet-bot-api:dev
RUN BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  && printf '{"buildTime":"%s","gitSha":"%s","image":"%s"}\n' \
       "$BUILD_TIME" "$GIT_SHA" "$BUILD_IMAGE" > /app/BUILD_INFO.json

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/BUILD_INFO.json ./BUILD_INFO.json

EXPOSE 3000
CMD ["node", "dist/server.js"]
