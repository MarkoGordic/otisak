#!/bin/bash
set -e

# Flags:
#   --clean / -clean   Wipe volumes + images (full reset). DESTRUCTIVE: deletes
#                      the postgres volume, so the admin gets re-bootstrapped
#                      with a brand-new random password and you lose all data.
#                      Without this flag we keep the DB, just rebuild the app.
#   --seed             After bring-up, run db/seed.sql against the DB. Currently
#                      a no-op (the file is empty by design — admin comes from
#                      the server bootstrap, students from the CSV importer).
#                      The flag is kept so the entry point survives if db/seed.sql
#                      is ever repopulated.
#   --no-pull          Skip "git pull" (useful for testing local changes).
#   --port N / -p N    Host port the app listens on (1024–65535). Persisted
#                      to .env as HOST_PORT so subsequent runs reuse it.
#                      Default on first run: 3000.
#   --no-firewall      Skip the ufw step entirely. Useful on hosts where
#                      ufw isn't installed, where sudo isn't available, or
#                      where firewall is managed elsewhere (cloud SG,
#                      iptables, nftables, Docker Desktop on macOS, etc.).
#                      Without this flag we still auto-skip if `ufw` isn't
#                      on PATH — the flag suppresses the attempt entirely.
#   --set-admin-password [pwd]
#                      Standalone mode. Updates the admin's bcrypt hash in
#                      the running DB and exits — NO compose down, NO
#                      rebuild, NO restart. Requires the app + db
#                      containers to already be up. If the password is
#                      omitted, the script prompts for it (hidden input)
#                      and asks for confirmation. Mutually exclusive with
#                      every deploy-related flag.

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
  --seed, -seed     After bring-up, run db/seed.sql against the DB. Currently
                    a no-op (the file is empty by design — admin comes from
                    the server bootstrap, students from the CSV importer).
  --no-pull         Skip "git pull" (useful for testing local changes).
  -p N, --port N    Host port the app listens on (1024–65535). Value is
                    persisted to .env as HOST_PORT so future runs reuse it.
                    Default on first run: 3000.
  --no-firewall     Skip the ufw step entirely. Useful on macOS / hosts
                    without ufw or sudo. Without the flag, ufw is auto-
                    skipped when not on PATH; the flag also skips when
                    ufw IS installed but you don't want to touch it.
  --set-admin-password [pwd]
                    STANDALONE MODE. Updates the admin's bcrypt hash in
                    the live DB and exits — no rebuild, no restart, no
                    git pull. App + db containers MUST already be up.
                    If 'pwd' is omitted the script prompts (hidden) and
                    asks for confirmation. Cannot combine with deploy
                    flags (--clean, --port, etc.).

Examples:
  ./deploy.sh                    Standard deploy (keeps DB, pulls latest).
  ./deploy.sh --port 8080        Deploy and publish app on host port 8080.
  ./deploy.sh --no-firewall      Deploy without touching ufw rules.
  ./deploy.sh --clean            Full reset: wipe DB, rebuild from scratch,
                                 print the new bootstrap admin password.
  ./deploy.sh --no-pull          Deploy local changes without git pull.
  ./deploy.sh --clean --no-pull  Reset DB using current local code.
  ./deploy.sh --set-admin-password
                                 Prompt for a new admin password and
                                 update it in-place (no redeploy).
  ./deploy.sh --set-admin-password 'My$ecret!23'
                                 Same, but pass the password inline.

After a successful deploy the script prints the bootstrapped admin
credentials (email + password) if a fresh admin was created, or a
"existing admin preserved" notice otherwise.
EOF
}

CLEAN=false
SEED=false
PULL=true
FIREWALL=true
PORT_OVERRIDE=""
SET_ADMIN_PWD_MODE=false
NEW_ADMIN_PWD=""

# Manual parser so we can support both "--port 8080" and "--port=8080"
# without dragging in getopt (BSD/GNU getopt are incompatible).
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)       show_help; exit 0 ;;
    -clean|--clean)  CLEAN=true; shift ;;
    -seed|--seed)    SEED=true;  shift ;;
    --no-pull)       PULL=false; shift ;;
    --no-firewall|--no-ufw)
      FIREWALL=false; shift ;;
    -p|--port)
      if [ -z "${2:-}" ]; then
        echo "Error: $1 requires a port number." >&2
        exit 1
      fi
      PORT_OVERRIDE="$2"
      shift 2
      ;;
    --port=*)
      PORT_OVERRIDE="${1#--port=}"
      shift
      ;;
    -p=*)
      PORT_OVERRIDE="${1#-p=}"
      shift
      ;;
    --set-admin-password|--reset-admin-password)
      SET_ADMIN_PWD_MODE=true
      # Optional inline password: only consume $2 if it's present and not
      # itself another flag. This lets `--set-admin-password` (no arg)
      # fall through to the prompt path below.
      if [ -n "${2:-}" ] && [ "${2#-}" = "$2" ]; then
        NEW_ADMIN_PWD="$2"
        shift 2
      else
        shift
      fi
      ;;
    --set-admin-password=*)
      SET_ADMIN_PWD_MODE=true
      NEW_ADMIN_PWD="${1#--set-admin-password=}"
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Run './deploy.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

# --set-admin-password is a standalone mode — refuse to combine it with
# any flag that would alter the deploy. The user explicitly wants "just
# change the password, nothing else".
if [ "$SET_ADMIN_PWD_MODE" = true ]; then
  if [ "$CLEAN" = true ] || [ "$SEED" = true ] || [ "$PULL" = false ] \
     || [ "$FIREWALL" = false ] || [ -n "$PORT_OVERRIDE" ]; then
    echo "Error: --set-admin-password cannot be combined with deploy flags." >&2
    echo "Run it on its own: './deploy.sh --set-admin-password [pwd]'." >&2
    exit 1
  fi
fi

# Validate port override (integer, 1024-65535 — privileged ports require root
# binding inside the host network namespace, which docker desktop won't grant).
if [ -n "$PORT_OVERRIDE" ]; then
  if ! [[ "$PORT_OVERRIDE" =~ ^[0-9]+$ ]] || [ "$PORT_OVERRIDE" -lt 1024 ] || [ "$PORT_OVERRIDE" -gt 65535 ]; then
    echo "Error: --port must be an integer between 1024 and 65535 (got: $PORT_OVERRIDE)." >&2
    exit 1
  fi
fi

# Pick a compose runner. Modern docker bundles "docker compose" (v2 plugin).
# Older / minimalist installs only ship the standalone "docker-compose" (v1)
# binary. Prefer v2 when both exist; fall back to v1; bail out with a clear
# message if neither is present. We also nudge BuildKit on for v1 — without
# it, the Dockerfile's `--mount=type=cache` lines fail to parse.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
  COMPOSE_VARIANT="v2 (plugin)"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
  COMPOSE_VARIANT="v1 (legacy standalone)"
  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
  echo "Install Docker Engine + the compose plugin, or 'pip install docker-compose'." >&2
  exit 1
fi

# ===========================================================================
# Standalone mode: --set-admin-password
#
# Touches NOTHING except the admin row in postgres. No compose down, no
# rebuild, no restart, no git pull, no firewall, no .env writes. App + db
# containers must already be running. We exit at the end of this block —
# the deploy flow below is never reached.
# ===========================================================================
if [ "$SET_ADMIN_PWD_MODE" = true ]; then
  echo "=== OTISAK admin password update (no redeploy) ==="

  # Both containers must be up and the app reachable for the bcrypt hash
  # call. We check them via compose ps to handle either v1 or v2 output.
  if ! $DC ps --status running 2>/dev/null | grep -q '\bapp\b' \
     && ! $DC ps 2>/dev/null | awk '$1 ~ /-app-/ {print $0}' | grep -qi 'up'; then
    echo "Error: 'app' container is not running. Start it with './deploy.sh' first." >&2
    exit 1
  fi
  if ! $DC ps --status running 2>/dev/null | grep -q '\bdb\b' \
     && ! $DC ps 2>/dev/null | awk '$1 ~ /-db-/ {print $0}' | grep -qi 'up'; then
    echo "Error: 'db' container is not running. Start it with './deploy.sh' first." >&2
    exit 1
  fi

  # If no inline password was passed, prompt twice (hidden input). We do
  # this AFTER the container check so the user doesn't waste time typing
  # a password into a dead environment.
  if [ -z "$NEW_ADMIN_PWD" ]; then
    if [ ! -t 0 ]; then
      echo "Error: no password supplied and stdin is not a TTY (cannot prompt)." >&2
      echo "Run interactively or pass the password inline: --set-admin-password 'pwd'." >&2
      exit 1
    fi
    printf "New admin password: "
    stty -echo
    read NEW_ADMIN_PWD
    stty echo
    printf "\n"
    printf "Confirm password:   "
    stty -echo
    read CONFIRM_PWD
    stty echo
    printf "\n"
    if [ "$NEW_ADMIN_PWD" != "$CONFIRM_PWD" ]; then
      echo "Error: passwords do not match." >&2
      exit 1
    fi
  fi

  # Minimum length matches what a sensible policy enforces — short enough
  # not to annoy admins, long enough that a leak isn't an instant win.
  if [ ${#NEW_ADMIN_PWD} -lt 8 ]; then
    echo "Error: password must be at least 8 characters." >&2
    exit 1
  fi

  ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@otisak.local}"

  # Hash inside the app container so we use the exact same bcryptjs
  # version the server uses for verification. Password goes via stdin so
  # it never appears in `ps` output or shell history files.
  HASH=$(printf %s "$NEW_ADMIN_PWD" | $DC exec -T app node -e '
    const bcrypt = require("bcryptjs");
    let pw = "";
    process.stdin.on("data", c => pw += c);
    process.stdin.on("end", async () => {
      const h = await bcrypt.hash(pw, 10);
      process.stdout.write(h);
    });
  ' 2>/dev/null)

  if [ -z "$HASH" ]; then
    echo "Error: failed to hash password inside the app container." >&2
    exit 1
  fi

  # UPSERT so this also works if for some reason the admin row was
  # deleted manually. role gets forced back to admin and is_active TRUE
  # so a half-disabled admin can't lock themselves out.
  if ! $DC exec -T db psql -U otisak -d otisak -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
INSERT INTO users (email, password_hash, name, role)
VALUES ('${ADMIN_EMAIL}', '${HASH}', 'Administrator', 'admin')
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = 'admin',
      is_active     = TRUE;
SQL
  then
    echo "Error: SQL update failed. Check './deploy.sh --help' or DB logs." >&2
    exit 1
  fi

  LINE=$(printf '=%.0s' $(seq 1 72))
  echo ""
  echo "$LINE"
  echo "Admin password updated. The app was NOT restarted — existing"
  echo "session cookies stay valid until they expire on their own."
  echo "  email: ${ADMIN_EMAIL}"
  echo "$LINE"
  exit 0
fi

# Resolve the host port we'll publish the app on. Precedence:
#   1. --port flag override (just validated above)
#   2. existing HOST_PORT in .env (persisted from a previous run)
#   3. fall back to 3000
EXISTING_PORT=""
if [ -f .env ] && grep -q '^HOST_PORT=' .env 2>/dev/null; then
  EXISTING_PORT=$(grep '^HOST_PORT=' .env | tail -1 | cut -d= -f2- | tr -d '\r"')
fi
HOST_PORT="${PORT_OVERRIDE:-${EXISTING_PORT:-3000}}"

echo "=== OTISAK Deploy Script ==="
[ "$CLEAN"    = true  ] && echo "  mode: CLEAN (volumes will be wiped)" || echo "  mode: keep volumes (data preserved)"
[ "$SEED"     = true  ] && echo "  seed: ON"
[ "$PULL"     = false ] && echo "  pull: OFF"
[ "$FIREWALL" = false ] && echo "  firewall: SKIP (--no-firewall)"
echo "  port:    ${HOST_PORT}"
echo "  compose: ${COMPOSE_VARIANT}"
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

# Persist HOST_PORT to .env so subsequent runs (and docker compose, which
# reads .env automatically) pick up the same value without --port being
# repeated. Always rewrite the line so an explicit --port override actually
# sticks.
touch .env
if grep -q '^HOST_PORT=' .env 2>/dev/null; then
  sed -i.bak '/^HOST_PORT=/d' .env && rm -f .env.bak
fi
echo "HOST_PORT=${HOST_PORT}" >> .env


# 1) Stop containers. Volume / image removal is gated on --clean.
if [ "$CLEAN" = true ]; then
  echo "[1/6] Stopping containers AND removing volumes + images..."
  $DC down -v --rmi all 2>/dev/null || true
  docker builder prune -f 2>/dev/null || true
else
  echo "[1/6] Stopping containers (keeping volumes + images)..."
  $DC down 2>/dev/null || true
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

# 3) Firewall — opens the chosen host port. Old rules from previous ports
# stay (ufw doesn't track them per-deploy); clean those up manually with
# `sudo ufw status numbered` + `sudo ufw delete N` if you care.
# Skipped entirely when --no-firewall is set, or when ufw isn't on PATH
# (e.g. macOS, Alpine, distroless containers, cloud images).
if [ "$FIREWALL" = false ]; then
  echo "[3/6] Skipping firewall (--no-firewall)."
elif ! command -v ufw >/dev/null 2>&1; then
  echo "[3/6] Skipping firewall: 'ufw' not on PATH (manage it elsewhere)."
elif ! command -v sudo >/dev/null 2>&1; then
  echo "[3/6] Skipping firewall: 'sudo' not available."
else
  echo "[3/6] Configuring firewall (ufw)..."
  if sudo ufw allow "${HOST_PORT}/tcp" >/dev/null 2>&1; then
    echo "Firewall port ${HOST_PORT} opened (or already allowed)."
  else
    echo "Skipping firewall: ufw not active or sudo declined."
  fi
fi
echo ""

# 4) Build. --no-cache only when CLEAN, otherwise let BuildKit cache mounts work.
echo "[4/6] Building Docker images..."
if [ "$CLEAN" = true ]; then
  $DC build --no-cache
else
  $DC build
fi
echo "Done."
echo ""

# 5) Start
echo "[5/6] Starting containers..."
$DC up -d
echo ""

# Wait for DB
echo "Waiting for database to be ready..."
for i in $(seq 1 30); do
  if $DC exec -T db pg_isready -U otisak >/dev/null 2>&1; then
    echo "Database ready."
    break
  fi
  sleep 1
done

# 6) Optional seed
if [ "$SEED" = true ]; then
  echo "[6/6] Seeding database (subject + question bank)..."
  CONTAINER=$($DC ps -q db)
  docker exec -i "$CONTAINER" psql -U otisak -d otisak < db/seed.sql 2>&1
  echo "Seed complete."
else
  echo "[6/6] Skipping seed (file is empty by design — nothing to load)."
fi

echo ""
echo "=== Deploy complete ==="
# Resolve a useful host string. `hostname -I` only exists on Linux; macOS,
# BSDs and minimal images don't have it, so fall back to the first non-loopback
# IPv4 we can find via ifconfig/ip, then to "localhost".
HOST=""
if command -v hostname >/dev/null 2>&1; then
  HOST=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$HOST" ] && command -v ip >/dev/null 2>&1; then
  HOST=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)
fi
if [ -z "$HOST" ] && command -v ifconfig >/dev/null 2>&1; then
  # Skip the whole 127.0.0.0/8 loopback range (some macs put VPN/tunnel IPs
  # in there) and pick the first plain IPv4.
  HOST=$(ifconfig 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {print $2; exit}')
fi
[ -z "$HOST" ] && HOST="localhost"
echo "App running at: http://${HOST}:${HOST_PORT}"
echo "WebSocket at:   ws://${HOST}:${HOST_PORT}/ws"
echo ""

# Wait for the app to finish booting (the WebSocket / bootstrap admin run
# inside the listen callback, so we have to poll until the banner shows up).
echo "Waiting for app to finish bootstrap..."
for i in $(seq 1 60); do
  if $DC logs app 2>/dev/null | grep -q 'OTISAK server running'; then
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
  HASH=$(printf %s "$ADMIN_PASSWORD" | $DC exec -T app node -e '
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
    if $DC exec -T db psql -U otisak -d otisak -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
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
  LOGS=$($DC logs app 2>/dev/null || true)
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
