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

show_help() {
  cat <<'EOF'
OTISAK deploy script

Usage: ./deploy.sh [flags]

Flags:
  -h, --help        Show this help message and exit.
  --clean, -clean   Wipe volumes + images (full reset). DESTRUCTIVE: deletes
                    the postgres volume, so the admin gets re-bootstrapped
                    with a brand-new random password and you lose all data.
                    Without this flag we keep the DB, just rebuild the app.
  --seed, -seed     After bring-up, run seed.sql against the DB. Currently
                    a no-op (the file is empty by design — admin comes from
                    the server bootstrap, students from the CSV importer).
  --no-pull         Skip "git pull" (useful for testing local changes).

Examples:
  ./deploy.sh                    Standard deploy (keeps DB, pulls latest).
  ./deploy.sh --clean            Full reset: wipe DB, rebuild from scratch,
                                 print the new bootstrap admin password.
  ./deploy.sh --no-pull          Deploy local changes without git pull.
  ./deploy.sh --clean --no-pull  Reset DB using current local code.

After a successful deploy the script prints the bootstrapped admin
credentials (email + password) if a fresh admin was created, or a
"existing admin preserved" notice otherwise.
EOF
}

CLEAN=false
SEED=false
PULL=true
for arg in "$@"; do
  case $arg in
    -h|--help)      show_help; exit 0 ;;
    -clean|--clean) CLEAN=true ;;
    -seed|--seed)   SEED=true  ;;
    --no-pull)      PULL=false ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run './deploy.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

echo "=== OTISAK Deploy Script ==="
[ "$CLEAN" = true ] && echo "  mode: CLEAN (volumes will be wiped)" || echo "  mode: keep volumes (data preserved)"
[ "$SEED"  = true ] && echo "  seed: ON"
[ "$PULL"  = false ] && echo "  pull: OFF"
echo ""

# Make sure SESSION_SECRET exists in .env so docker-compose can read it.
# The server refuses to start without a non-default 16+ character secret.
# We generate a fresh one on first run; subsequent runs reuse the same value
# so existing session cookies stay valid across redeploys.
if [ ! -f .env ] || ! grep -q '^SESSION_SECRET=' .env 2>/dev/null; then
  if command -v openssl >/dev/null 2>&1; then
    NEW_SECRET=$(openssl rand -hex 32)
  else
    NEW_SECRET=$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
  fi
  touch .env
  if grep -q '^SESSION_SECRET=' .env 2>/dev/null; then
    sed -i.bak '/^SESSION_SECRET=/d' .env && rm -f .env.bak
  fi
  echo "SESSION_SECRET=${NEW_SECRET}" >> .env
  echo "Generated SESSION_SECRET in .env (64 hex chars)."
fi


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

# Wait for the app to finish booting (the WebSocket / bootstrap admin run
# inside the listen callback, so we have to poll until the banner shows up).
echo "Waiting for app to finish bootstrap..."
for i in {1..60}; do
  if docker compose logs app 2>/dev/null | grep -q 'OTISAK server running'; then
    break
  fi
  sleep 1
done
# Give bootstrap one more second to flush its admin banner if it fired.
sleep 1

ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@otisak.local}"
ADMIN_PASSWORD=""
BOOTSTRAP_SEEN=false

# --clean ALWAYS rotates the admin password and prints it. The volume was
# wiped, so even though server-side bootstrap will already have set a random
# password, we deterministically re-set it here so the script knows exactly
# what it is — no log scraping, no race.
if [ "$CLEAN" = true ]; then
  echo "Forcing a fresh admin password..."

  # 12 chars from a copy-friendly alphabet (no 0/O, 1/l/I, no slashes).
  ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  ADMIN_PASSWORD=""
  for _ in $(seq 1 12); do
    R=$(( RANDOM % ${#ALPHABET} ))
    ADMIN_PASSWORD="${ADMIN_PASSWORD}${ALPHABET:$R:1}"
  done

  # Compute the bcrypt hash inside the app container so we can use the same
  # bcryptjs install the server uses. Write the password to stdin so it
  # never appears as a process argument.
  HASH=$(printf %s "$ADMIN_PASSWORD" | docker compose exec -T app node -e '
    const bcrypt = require("bcryptjs");
    let pw = "";
    process.stdin.on("data", c => pw += c);
    process.stdin.on("end", async () => {
      const h = await bcrypt.hash(pw, 10);
      process.stdout.write(h);
    });
  ' 2>/dev/null)

  if [ -n "$HASH" ]; then
    # UPSERT so this works whether or not bootstrap already created the row.
    if docker compose exec -T db psql -U otisak -d otisak -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
INSERT INTO users (email, password_hash, name, role)
VALUES ('${ADMIN_EMAIL}', '${HASH}', 'Administrator', 'admin')
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = 'admin',
      is_active     = TRUE;
SQL
    then
      BOOTSTRAP_SEEN=true
    else
      ADMIN_PASSWORD=""  # SQL failed — fall through to the log-scrape path
    fi
  fi
fi

# Non-clean path (or clean fallback if hashing/SQL above failed): try to read
# the password from the bootstrap banner in app logs. If admin already
# existed (volume preserved), no banner = no rotation, password unchanged.
if [ -z "$ADMIN_PASSWORD" ]; then
  LOGS=$(docker compose logs app 2>/dev/null || true)
  if echo "$LOGS" | grep -q 'admin account bootstrapped'; then
    BOOTSTRAP_SEEN=true
    LINE_EMAIL=$(echo "$LOGS"    | grep -A 3 'admin account bootstrapped' | grep 'email:'    | tail -1 | sed -E 's/.*email:[[:space:]]+//' | tr -d '\r')
    LINE_PWD=$(echo "$LOGS"      | grep -A 3 'admin account bootstrapped' | grep 'password:' | tail -1 | sed -E 's/.*password:[[:space:]]+//' | tr -d '\r')
    [ -n "$LINE_EMAIL" ] && ADMIN_EMAIL="$LINE_EMAIL"
    [ -n "$LINE_PWD" ]   && ADMIN_PASSWORD="$LINE_PWD"
  fi
fi

LINE=$(printf '=%.0s' {1..72})
echo ""
echo "$LINE"
if [ "$BOOTSTRAP_SEEN" = true ] && [ -n "$ADMIN_PASSWORD" ]; then
  if [ "$CLEAN" = true ]; then
    echo "ADMIN ACCOUNT (forced new password — save this NOW):"
  else
    echo "ADMIN ACCOUNT (newly bootstrapped — save this NOW):"
  fi
  echo "  email:    ${ADMIN_EMAIL}"
  echo "  password: ${ADMIN_PASSWORD}"
  echo "  This password is not stored in plaintext anywhere else."
else
  echo "ADMIN ACCOUNT: existing admin preserved (password unchanged)."
  echo "  To force a new password, re-run with --clean."
fi
echo "$LINE"
echo ""
