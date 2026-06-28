########################################
# Stage 1 — install all workspace deps
########################################
FROM node:24-slim AS deps

RUN npm install -g pnpm@latest --quiet

WORKDIR /workspace

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Lib packages
COPY lib/db/package.json                 ./lib/db/
COPY lib/api-spec/package.json           ./lib/api-spec/
COPY lib/api-zod/package.json            ./lib/api-zod/
COPY lib/api-client-react/package.json   ./lib/api-client-react/

# Artifact packages
COPY artifacts/api-server/package.json   ./artifacts/api-server/
COPY artifacts/sogram/package.json       ./artifacts/sogram/

# Scripts package (needed for workspace graph)
COPY scripts/package.json                ./scripts/

RUN pnpm install --frozen-lockfile


########################################
# Stage 2 — build everything
########################################
FROM deps AS builder

# Copy full source
COPY . .

# Build the API server (esbuild → artifacts/api-server/dist/)
RUN NODE_ENV=production \
    pnpm --filter @workspace/api-server run build

# Build the frontend (Vite → artifacts/sogram/dist/public/)
# PORT and BASE_PATH are consumed by vite.config.ts at build time only
RUN PORT=80 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/sogram run build

# Produce a standalone deploy directory for the api-server:
# - resolves all production deps (including @langchain/*) without pnpm symlinks
# - safe to copy into the final image as-is
RUN pnpm --filter @workspace/api-server deploy --prod /deploy


########################################
# Stage 3 — lean production image
########################################
FROM node:24-slim AS runner

# nginx serves the frontend and reverse-proxies /api/* to Node
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# API: standalone node_modules from pnpm deploy
COPY --from=builder /deploy ./api

# API: esbuild output (the actual runnable code + pino workers)
COPY --from=builder /workspace/artifacts/api-server/dist ./api/dist

# Frontend: Vite static output → nginx web root
COPY --from=builder /workspace/artifacts/sogram/dist/public /usr/share/nginx/html

# Config files
COPY nginx.conf      /etc/nginx/nginx.conf
COPY docker-start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

ENV NODE_ENV=production
# API server always runs on 9000 internally; nginx proxies to it
ENV PORT=9000

CMD ["/app/start.sh"]
