# No "# syntax=" line on purpose: it makes BuildKit fetch the Dockerfile frontend from Docker Hub
# itself, bypassing the daemon's proxy, which fails on hosts that reach the internet only through one.
# The built-in frontend of Docker 23+ already supports RUN --mount.
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
WORKDIR /app
COPY app/client/package.json app/client/package-lock.json* ./client/
RUN --mount=type=cache,target=/root/.npm \
    cd client && npm ci --no-audit --no-fund
COPY app/client/ ./client/
# Bilingual docs ship inside the client bundle: vite's import.meta.glob in
# app/client/src/lib/docs.ts reads from ../../../docs/**/*.md, so docs/ has to
# be physically present next to client/ at build time.
COPY app/docs/ ./docs/
WORKDIR /app/client
RUN npm run build

# ========================================
# Stage 2a: Server build (needs devDeps)
# ========================================
FROM node:20-slim AS server-build
WORKDIR /app/server
# Skip chromium download during npm install - the runner image uses the
# system chromium so the puppeteer-bundled one is wasted bytes here.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    npm_config_cache=/root/.npm
COPY app/server/package.json app/server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY app/server/ ./
RUN npm run build

# ========================================
# Stage 2b: Server prod deps only (no tsx/typescript/@types)
# ========================================
FROM node:20-slim AS server-prod-deps
WORKDIR /app/server
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    npm_config_cache=/root/.npm
COPY app/server/package.json app/server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# sharp: the prebuilt linux-x64 binary needs an x86-64-v2 CPU (SSE4.2). On an older CPU (e.g. a Xeon
# E5420) sharp has to use its WebAssembly build instead, which needs SSE4.1 visible to the machine (on
# Proxmox: CPU type "host", not the default kvm64). The native package must go: sharp loads it first,
# rejects it on such a CPU and never tries the WebAssembly one.
# SHARP_WASM=auto picks WebAssembly when the build host has no sse4_2; 1 forces it, 0 keeps native.
# The image is meant to be built on the host that runs it.
ARG SHARP_WASM=auto
RUN --mount=type=cache,target=/root/.npm \
    if [ "$SHARP_WASM" = 1 ] || { [ "$SHARP_WASM" = auto ] && ! grep -qw sse4_2 /proc/cpuinfo; }; then \
        v="$(node -p "require('./node_modules/sharp/package.json').version")" \
        && npm install --no-save --force --no-audit --no-fund "@img/sharp-wasm32@${v}" \
        && rm -rf node_modules/@img/sharp-linux-x64 node_modules/@img/sharp-libvips-linux-x64 \
                  node_modules/@img/sharp-linuxmusl-x64 node_modules/@img/sharp-libvips-linuxmusl-x64 \
        && echo "sharp: WebAssembly build"; \
    else \
        echo "sharp: native build"; \
    fi

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
        fonts-dejavu-core \
        fonts-noto-core \
        libnss3 \
        libgbm1 \
        libxss1

RUN groupadd --system --gid 1001 otisak \
    && useradd --system --uid 1001 --gid otisak --create-home otisak

# Server: compiled JS + prod-only node_modules (no devDeps, smaller image)
# Note: no `chown -R /app` after the COPYs. The server only *reads* its bundle
# at runtime (no fs.write* calls, Puppeteer writes to /tmp which is world-
# writable) so the default root-owned + world-readable bits from COPY are
# enough. Skipping the recursive chown shaves a layer worth of file copies
# off the final image (which would otherwise duplicate every file with new
# ownership metadata) and a couple of seconds off the build.
COPY --from=server-build      /app/server/dist           ./server/dist
COPY --from=server-prod-deps  /app/server/node_modules   ./server/node_modules
COPY --from=server-build      /app/server/package.json   ./server/

# Client: pre-built static assets
COPY --from=client-build /app/client/dist ./client/dist

# Fail the build, not the server start, when sharp cannot run on this CPU (see SHARP_WASM above).
RUN cd /app/server && node -e "require('sharp')({create:{width:8,height:8,channels:3,background:'red'}}).webp().toBuffer().then(() => console.log('sharp ok'))"

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
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["node", "dist/index.js"]
