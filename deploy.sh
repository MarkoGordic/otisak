#!/bin/bash
set -e

# Flags:
#   --clean / -clean   Wipe volumes + images (full reset). DESTRUCTIVE: deletes
#                      the postgres volume, so the admin gets re-bootstrapped
#                      with a brand-new random password and you lose all data.
#                      Without this flag we keep the DB, just rebuild the app.
#   --seed             After bring-up, run seed.sql against the DB. Currently
#                      a no-op (the file is empty by design — admin comes from
#                      the server bootstrap, students from the CSV importer).
#                      The flag is kept so the entry point survives if seed.sql
#                      is ever repopulated.
#   --no-pull          Skip "git pull" (useful for testing local changes).

CLEAN=false
SEED=false
PULL=true
for arg in "$@"; do
  case $arg in
    -clean|--clean) CLEAN=true ;;
    -seed|--seed)   SEED=true  ;;
    --no-pull)      PULL=false ;;
  esac
done

echo "=== OTISAK Deploy Script ==="
[ "$CLEAN" = true ] && echo "  mode: CLEAN (volumes will be wiped)" || echo "  mode: keep volumes (data preserved)"
[ "$SEED"  = true ] && echo "  seed: ON"
[ "$PULL"  = false ] && echo "  pull: OFF"
echo ""

# 1) Stop containers. Volume / image removal is gated on --clean.
if [ "$CLEAN" = true ]; then
  echo "[1/6] Stopping containers AND removing volumes + images..."
  docker compose down -v --rmi all 2>/dev/null || true
  docker builder prune -f 2>/dev/null || true
else
  echo "[1/6] Stopping containers (keeping volumes + images)..."
  docker compose down 2>/dev/null || true
fi
echo "Done."
echo ""

# 2) Pull latest code
if [ "$PULL" = true ]; then
  echo "[2/6] Pulling latest code from GitHub..."
  git pull origin main
  echo "Done."
else
  echo "[2/6] Skipping git pull."
fi
echo ""

# 3) Firewall
echo "[3/6] Configuring firewall (ufw)..."
if command -v ufw &> /dev/null; then
  sudo ufw allow 3000/tcp 2>/dev/null || echo "ufw rule may already exist or ufw not active"
  echo "Firewall port 3000 opened."
else
  echo "ufw not found, skipping firewall configuration."
fi
echo ""

# 4) Build. --no-cache only when CLEAN, otherwise let BuildKit cache mounts work.
echo "[4/6] Building Docker images..."
if [ "$CLEAN" = true ]; then
  docker compose build --no-cache
else
  docker compose build
fi
echo "Done."
echo ""

# 5) Start
echo "[5/6] Starting containers..."
docker compose up -d
echo ""

# Wait for DB
echo "Waiting for database to be ready..."
for i in {1..30}; do
  if docker compose exec -T db pg_isready -U otisak >/dev/null 2>&1; then
    echo "Database ready."
    break
  fi
  sleep 1
done

# 6) Optional seed
if [ "$SEED" = true ]; then
  echo "[6/6] Seeding database (subject + question bank)..."
  CONTAINER=$(docker compose ps -q db)
  docker exec -i "$CONTAINER" psql -U otisak -d otisak < seed.sql 2>&1
  echo "Seed complete."
else
  echo "[6/6] Skipping seed (file is empty by design — nothing to load)."
fi

echo ""
echo "=== Deploy complete ==="
HOST=$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')
echo "App running at: http://${HOST}:3000"
echo "WebSocket at:   ws://${HOST}:3000/ws"
echo ""
if [ "$CLEAN" = true ]; then
  echo "First-time admin password is printed in the container logs:"
  echo "  docker compose logs app | grep -A 3 'admin account bootstrapped'"
fi
echo ""
