---
name: Lib packages build
description: How to build @workspace/db, @workspace/api-zod, @workspace/api-client-react so TypeScript project references resolve
---

The monorepo lib packages (`lib/db`, `lib/api-zod`, `lib/api-client-react`) use TypeScript composite mode (`"composite": true`, `"emitDeclarationOnly": true`) but have no `build` script in their `package.json`.

**Rule:** Run the following to build all lib dist/ before running per-artifact typechecks:
```
/home/runner/workspace/node_modules/.bin/tsc --build lib/db lib/api-zod lib/api-client-react
```

**Why:** Without this, TS6305 errors appear in any artifact that imports these libs ("Output file has not been built from source file"). The root `tsconfig.json` declares them as `references`, so they must be built first.

**How to apply:** Run this once per session before `pnpm --filter @workspace/sogram run typecheck` or similar. The root `pnpm run typecheck` script runs `typecheck:libs` automatically, but per-artifact typechecks do not.
