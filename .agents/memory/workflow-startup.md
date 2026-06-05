---
name: Workflow startup env vars
description: Required environment variables for starting the sogram monorepo dev workflow
---

Both services need explicit env vars in the workflow command — they are NOT inferred from artifact.toml automatically.

**Working workflow command:**
```
PORT=8080 pnpm --filter @workspace/api-server run dev & BASE_PATH=/ PORT=23860 pnpm --filter @workspace/sogram run dev
```

**Why:** The vite.config.ts and api-server/src/index.ts both throw hard errors if PORT (and BASE_PATH for sogram) are not set. The values come from artifact.toml but must be passed explicitly in the workflow.

**Port mapping:**
- api-server: PORT=8080 (internal), proxied at /api
- sogram: PORT=23860 → external port 80 (main preview)

**How to apply:** Any time you restart or reconfigure the workflow, use the command above exactly.

**DB schema:** After a fresh environment, run `pnpm --filter @workspace/db run push` to create tables before starting the server (otherwise signal resolver errors on boot, which are non-fatal but noisy).
