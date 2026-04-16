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
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/ ./
RUN npm run build

# ========================================
# Stage 3: Production
# ========================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 otisak && \
    adduser --system --uid 1001 otisak

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

WORKDIR /app/server
CMD ["node", "dist/index.js"]
