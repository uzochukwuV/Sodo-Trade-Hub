#!/bin/sh
set -e

# Validate required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

echo "Starting Sogram API server on port $PORT..."
node --enable-source-maps /app/api/dist/index.mjs &
API_PID=$!

echo "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Forward signals to both child processes
trap "kill $API_PID $NGINX_PID 2>/dev/null; exit 0" TERM INT

# Wait for either process to exit — if one dies, kill the other and exit
wait -n 2>/dev/null || {
  # wait -n not supported (busybox) — fall back to polling
  while kill -0 $API_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
    sleep 2
  done
}

echo "A process exited — shutting down container"
kill $API_PID $NGINX_PID 2>/dev/null
exit 1
