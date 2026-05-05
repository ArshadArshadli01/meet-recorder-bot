# meet-bot dashboard — Next.js 15 (App Router). Self-contained: build context is
# `apps/dashboard/` and the image runs `next start -p 4000` against the API URL
# in NEXT_PUBLIC_API_BASE_URL (proxied via next.config.mjs rewrites).
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Baked into `next build` rewrites — must be reachable from *inside* the
# dashboard container (Compose service name), not localhost.
ARG INTERNAL_API_BASE_URL=http://api:3000
ENV INTERNAL_API_BASE_URL=$INTERNAL_API_BASE_URL
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_DASHBOARD_ORIGIN=http://localhost:4000
ENV NEXT_PUBLIC_DASHBOARD_ORIGIN=$NEXT_PUBLIC_DASHBOARD_ORIGIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 4000
# Compose overrides PORT (e.g. 4100) so host mapping and Next logs match.
CMD ["npx", "next", "start"]
