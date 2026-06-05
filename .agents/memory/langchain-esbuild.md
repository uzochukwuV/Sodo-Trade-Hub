---
name: LangChain esbuild externals
description: How to bundle LangChain.js with esbuild in this project, and which imports to use/avoid
---

## Rule
Mark all LangChain packages as external in `build.mjs` so esbuild doesn't try to bundle them — they're loaded from node_modules at runtime.

Add to the `external` array in `artifacts/api-server/build.mjs`:
```
"langchain",
"langchain/*",
"@langchain/*",
```

## Why
LangChain v1.4.4 only exports a small set of subpaths (`.`, `./browser`, `./hub`, `./load`, `./tools`, etc.). Subpaths like `langchain/agents` are NOT in the exports map and will cause `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime and build-time resolution errors with esbuild.

## How to apply
- When using `@langchain/openai` (ChatOpenAI) + `@langchain/core`: these are properly exported — use `@langchain/core/messages`, `@langchain/core/messages/tool`, `@langchain/core/tools`.
- **Do NOT use `langchain/agents`** (not exported by v1.4.4). Instead, implement the tool-calling loop manually:
  1. `model.bindTools(tools)` → invoke → check `response.tool_calls`
  2. If tool calls present: execute each, push `ToolMessage` results, repeat
  3. Final answer when no tool_calls in response
- Chatbot is in `artifacts/api-server/src/services/chatbot.ts`, route at `artifacts/api-server/src/routes/chat.ts` (`POST /api/chat`).
