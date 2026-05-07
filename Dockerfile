# syntax=docker/dockerfile:1.6
#
# Build optimisations:
#   - BuildKit cache mounts for apt and npm so re-runs reuse downloaded
#     packages instead of re-fetching every time.
#   - npm ci with --no-audit --no-fund (faster, deterministic install).
#   - Heavy apt + chromium step lives at the top of the runner stage so it
#     stays cached across code-only rebuilds (it changes only if the
#     Debian package list does).
#   - Trimmed Chromium runtime deps to the minimum that the chromium
#     package's own dependencies don't already pull in.
#   - Server has TWO npm install stages: full (with devDeps for tsc) and
#     prod (omit=dev) so the runtime image doesn't ship typescript/tsx.

# ========================================
# Stage 1: Build client (Vite + Tailwind)
# ========================================
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ========================================
# Stage 2a: Server build (needs devDeps)
# ========================================
FROM node:20-slim AS server-build
WORKDIR /app/server
# Skip chromium download during npm install — the runner image uses the
# system chromium so the puppeteer-bundled one is wasted bytes here.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    npm_config_cache=/root/.npm
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ========================================
# Stage 2b: Server prod deps only (no tsx/typescript/@types)
# ========================================
FROM node:20-slim AS server-prod-deps
WORKDIR /app/server
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    npm_config_cache=/root/.npm
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ========================================
# Stage 3: Production runner
# ========================================
FROM node:20-slim AS runner
WORKDIR /app

# Cache mounts on /var/cache/apt + /var/lib/apt let repeated builds skip
# the package download. We also drop the apt list cleanup workaround
# (rm -rf /var/lib/apt/lists/*) because the cache mount handles it.
ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        libnss3 \
        libgbm1 \
        libxss1

RUN groupadd --system --gid 1001 otisak \
    && useradd --system --uid 1001 --gid otisak --create-home otisak

# Server: compiled JS + prod-only node_modules (no devDeps, smaller image)
COPY --from=server-build      /app/server/dist           ./server/dist
COPY --from=server-prod-deps  /app/server/node_modules   ./server/node_modules
COPY --from=server-build      /app/server/package.json   ./server/

# Client: pre-built static assets
COPY --from=client-build /app/client/dist ./client/dist

# Make sure runtime dirs the non-root user writes to are owned by them.
RUN chown -R otisak:otisak /app

USER otisak
EXPOSE 3001
ENV NODE_ENV=production \
    PORT=3001 \
    CLIENT_DIST_PATH=/app/client/dist \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# In-image healthcheck mirrors the one in docker-compose.yml so the image
# is also healthy under plain `docker run` / orchestrators that don't read
# compose. Compose's healthcheck overrides this when present.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["node", "dist/index.js"]
