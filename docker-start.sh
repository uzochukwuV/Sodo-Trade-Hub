#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

echo "[startup] Running database migrations..."
node /app/migrate.mjs

echo "[startup] Starting Sogram API server on port $PORT..."
node --enable-source-maps /app/api/dist/index.mjs &
API_PID=$!

echo "[startup] Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

trap "kill $API_PID $NGINX_PID 2>/dev/null; exit 0" TERM INT

# Wait for either process to exit
while kill -0 $API_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
  sleep 2
done

echo "[startup] A process exited — shutting down container"
kill $API_PID $NGINX_PID 2>/dev/null
exit 1
