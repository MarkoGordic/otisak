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
# Stage 2: Build server (TypeScript -> dist)
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

# Copy server build + deps
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/package.json ./server/

# Copy client build
COPY --from=client-build /app/client/dist ./client/dist

USER otisak
EXPOSE 3001
ENV NODE_ENV=production \
    PORT=3001 \
    CLIENT_DIST_PATH=/app/client/dist \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app/server
CMD ["node", "dist/index.js"]
