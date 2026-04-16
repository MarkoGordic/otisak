#!/bin/bash
set -e

echo "=== OTISAK Deploy Script ==="
echo ""

# Stop and remove everything
echo "[1/4] Stopping and removing old containers, volumes, and images..."
docker compose down -v --rmi all 2>/dev/null || true
docker builder prune -f 2>/dev/null || true
echo "Done."
echo ""

# Pull latest code
echo "[2/4] Pulling latest code from GitHub..."
git pull origin main
echo "Done."
echo ""

# Build fresh
echo "[3/4] Building fresh Docker images (no cache)..."
docker compose build --no-cache
echo "Done."
echo ""

# Start
echo "[4/4] Starting containers..."
docker compose up -d
echo ""

# Wait for health check
echo "Waiting for database to be ready..."
sleep 5

echo ""
echo "=== Deploy complete ==="
echo "App running at: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000"
echo ""
echo "Default admin: admin@otisak.local / admin123"
echo ""
