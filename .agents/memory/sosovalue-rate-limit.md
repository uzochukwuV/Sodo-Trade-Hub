---
name: SoSoValue rate limit
description: SoSoValue API error code 402901 and how to avoid it with deduplication
---

The SoSoValue API (`openapi.sosovalue.com/openapi/v1/news`) returns error code 402901 when hit with rapid concurrent requests (e.g., multiple in-flight cache misses during the same refresh window).

**Rule:** The `fetchRawItems()` function in `artifacts/api-server/src/services/market.ts` uses an `_sosoInflight` promise variable to deduplicate concurrent requests. The raw item cache TTL is 15 minutes; the `intelligence` endpoint cache is 5 minutes.

**Why:** During cache expiry windows, multiple simultaneous API requests (from polling clients, background fetch, etc.) all trigger `fetchRawItems()` before the first one completes. Without deduplication, 3+ simultaneous HTTP calls to SoSoValue trigger 402901 rate-limit errors.

**How to apply:** The `_sosoInflight` guard pattern — if a promise is already in flight, return it directly instead of starting a new fetch. Always clear `_sosoInflight` in a `finally` block. On 402901, the catch block returns stale cached data via `getCached("intelligence")` fallback.
