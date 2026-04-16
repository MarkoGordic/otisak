#!/bin/bash
set -e

echo "=== OTISAK Deploy Script ==="
echo ""

# Stop and remove everything
echo "[1/5] Stopping and removing old containers, volumes, and images..."
docker compose down -v --rmi all 2>/dev/null || true
docker builder prune -f 2>/dev/null || true
echo "Done."
echo ""

# Pull latest code
echo "[2/5] Pulling latest code from GitHub..."
git pull origin main
echo "Done."
echo ""

# Open firewall port
echo "[3/5] Configuring firewall (ufw)..."
if command -v ufw &> /dev/null; then
  sudo ufw allow 3000/tcp 2>/dev/null || echo "ufw rule may already exist or ufw not active"
  sudo ufw allow 5432/tcp 2>/dev/null || echo "ufw rule may already exist or ufw not active"
  echo "Firewall ports 3000 and 5432 opened."
else
  echo "ufw not found, skipping firewall configuration."
fi
echo ""

# Build fresh
echo "[4/5] Building fresh Docker images (no cache)..."
docker compose build --no-cache
echo "Done."
echo ""

# Start
echo "[5/5] Starting containers..."
docker compose up -d
echo ""

# Wait for health check
echo "Waiting for services to be ready..."
sleep 5

echo ""
echo "=== Deploy complete ==="
echo "App running at: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000"
echo "WebSocket at:   ws://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000/ws"
echo ""
echo "Default admin: admin@otisak.local / admin123"
echo ""
