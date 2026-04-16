#!/bin/bash
set -e

SEED=false
for arg in "$@"; do
  case $arg in
    -seed|--seed) SEED=true ;;
  esac
done

echo "=== OTISAK Deploy Script ==="
echo ""

# Stop and remove everything
echo "[1/6] Stopping and removing old containers, volumes, and images..."
docker compose down -v --rmi all 2>/dev/null || true
docker builder prune -f 2>/dev/null || true
echo "Done."
echo ""

# Pull latest code
echo "[2/6] Pulling latest code from GitHub..."
git pull origin main
echo "Done."
echo ""

# Open firewall port
echo "[3/6] Configuring firewall (ufw)..."
if command -v ufw &> /dev/null; then
  sudo ufw allow 3000/tcp 2>/dev/null || echo "ufw rule may already exist or ufw not active"
  echo "Firewall port 3000 opened."
else
  echo "ufw not found, skipping firewall configuration."
fi
echo ""

# Build fresh
echo "[4/6] Building fresh Docker images (no cache)..."
docker compose build --no-cache
echo "Done."
echo ""

# Start
echo "[5/6] Starting containers..."
docker compose up -d
echo ""

# Wait for DB
echo "Waiting for database to be ready..."
sleep 8

# Seed data if requested
if [ "$SEED" = true ]; then
  echo "[6/6] Seeding database with test data..."
  CONTAINER=$(docker compose ps -q db)
  docker exec -i "$CONTAINER" psql -U otisak -d otisak < seed.sql 2>&1
  echo "Seed complete: Arhitektura racunara + 15 pitanja + 15 studenata (IN 1-15/2025) + ispit"
else
  echo "[6/6] Skipping seed (use -seed flag to seed test data)"
fi

echo ""
echo "=== Deploy complete ==="
echo "App running at: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000"
echo "WebSocket at:   ws://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3000/ws"
echo ""
echo "Default admin:  admin@otisak.local / admin123"
if [ "$SEED" = true ]; then
  echo "Test students:  IN 1/2025 - IN 15/2025 (password: student123)"
fi
echo ""
