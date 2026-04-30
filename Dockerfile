# ========================================
# Stage 1: Build client
# ========================================
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ========================================
# Stage 2: Build server
# ========================================
# Use Debian slim instead of Alpine because puppeteer's bundled Chromium
# only ships glibc binaries.
FROM node:20-slim AS server-build
WORKDIR /app/server
# Skip chromium download during npm install — runner image installs system chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/ ./
RUN npm run build

# ========================================
# Stage 3: Production
# ========================================
FROM node:20-slim AS runner
WORKDIR /app

# Install Chromium and the runtime libs puppeteer needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
      libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
      libpango-1.0-0 libx11-6 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxrandr2 libxshmfence1 libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

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
ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app/server
CMD ["node", "dist/index.js"]
