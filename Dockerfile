########################################
# Stage 1 — install deps + build
########################################
FROM node:24-slim AS builder

# Build tools needed by native packages (@swc/core, unrs-resolver, esbuild)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm matching the version used in development
RUN npm install -g pnpm@10 --quiet

WORKDIR /workspace

# Copy the FULL workspace upfront.
# Copying package.json files piecemeal is fragile with pnpm workspaces because
# pnpm needs the complete workspace graph at install time.
COPY . .

# Install all deps.
# --no-frozen-lockfile: the lockfile was generated on NixOS/Replit; platform
#   overrides make it strict-fail on standard Debian Linux in Docker.
# --ignore-scripts: skip post-install scripts for packages we don't need them
#   for (they run fine when we build explicitly below).
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Re-run prepare scripts only for packages that actually need it (esbuild binary)
RUN pnpm rebuild esbuild --no-bail 2>/dev/null || true

# ── Build API server (esbuild → artifacts/api-server/dist/) ─────────────────
RUN NODE_ENV=production \
    pnpm --filter @workspace/api-server run build

# ── Build frontend (Vite → artifacts/sogram/dist/public/) ───────────────────
# PORT and BASE_PATH are only consumed by vite.config.ts at build time, not runtime.
# REPL_ID must be unset so Replit-specific plugins are skipped.
RUN PORT=80 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/sogram run build

# ── Produce a standalone deploy for the API ──────────────────────────────────
# pnpm deploy copies all production node_modules (no symlinks) so the runner
# stage doesn't need pnpm or the full workspace.
RUN pnpm --filter @workspace/api-server deploy --prod /deploy


########################################
# Stage 2 — lean production runner
########################################
FROM node:24-slim AS runner

# nginx serves the frontend and reverse-proxies /api/* to Node
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# API: standalone node_modules (no pnpm, no symlinks)
COPY --from=builder /deploy ./api

# API: esbuild output — dist/index.mjs + pino worker bundles
COPY --from=builder /workspace/artifacts/api-server/dist ./api/dist

# Frontend: Vite static output → nginx web root
COPY --from=builder /workspace/artifacts/sogram/dist/public /usr/share/nginx/html

# Config files baked into the image
COPY nginx.conf      /etc/nginx/nginx.conf
COPY docker-start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

ENV NODE_ENV=production
# API always runs on 9000 internally; nginx proxies to it
ENV PORT=9000

CMD ["/app/start.sh"]
