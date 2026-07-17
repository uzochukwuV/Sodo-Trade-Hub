#!/bin/bash
# Dev environment startup script for the Sogram monorepo.
# Boots PostgreSQL, then the API server (:9000) and the Vite frontend (:5000).
set -u

eval "$(mise activate bash)"

# --- Local dev environment (non-secret placeholders / public config) ---------
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/sogram}"
export SESSION_SECRET="${SESSION_SECRET:-dev-placeholder-session-secret}"
export SODEX_BASE_URL="${SODEX_BASE_URL:-https://testnet-gw.sodex.dev/api/v1}"
export SOSO_BASE_URL="${SOSO_BASE_URL:-https://openapi.sosovalue.com/openapi/v1}"
export SOSO_API_KEY="${SOSO_API_KEY:-SOSO-45c68ba8a8bb496989d958dabe0e9d1f}"
export ENABLE_INDEXERS="${ENABLE_INDEXERS:-1}"
export NODE_ENV="${NODE_ENV:-development}"

REPO_DIR="/home/user/project"
PID_DIR="/home/user/.runtm/svc-pids"
mkdir -p "$PID_DIR"

# --- Ensure PostgreSQL is running --------------------------------------------
if ! ss -tuln | grep -q ':5432'; then
  sudo pg_ctlcluster 16 main start || true
fi

# --- API server (Express, port 9000) -----------------------------------------
(cd "$REPO_DIR" && setsid bash -c 'PORT=9000 pnpm --filter @workspace/api-server run dev' \
   > /tmp/runtm-api-server.log 2>&1 < /dev/null &
 echo $! > "$PID_DIR/api-server.pgid")

# --- Frontend (Vite, port 5000) -----------------------------------------------
(cd "$REPO_DIR" && setsid bash -c 'BASE_PATH=/ PORT=5000 API_PORT=9000 pnpm --filter @workspace/sogram run dev' \
   > /tmp/runtm-sogram.log 2>&1 < /dev/null &
 echo $! > "$PID_DIR/sogram.pgid")

wait
