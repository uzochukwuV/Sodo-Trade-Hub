"""Per-signing-address atomic nonce allocation.

Docs: "the 100 highest nonces are stored per signing address. Every new
transaction must have a nonce larger than the smallest nonce in this set."
Nonces must fall in (T - 2 days, T + 1 day) where T is block time in ms.

Nonces are tracked PER SIGNING ADDRESS -- i.e. per API key's public key for
trading actions, and per master wallet address for addAPIKey/revokeAPIKey.
Docs explicitly warn: use a separate API key per concurrent trading process,
because two processes sharing one signing address race on the nonce.

This manager gives each signing address its own monotonic counter in Redis,
advanced atomically via a Lua script so concurrent batch workers never reuse
or go backwards on a nonce, even under heavy concurrency.
"""
from __future__ import annotations

import time

from redis.asyncio import Redis

_ADVANCE_SCRIPT = """
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local now = tonumber(ARGV[1])
local nxt = cur + 1
if now > nxt then
  nxt = now
end
redis.call('SET', KEYS[1], nxt)
return nxt
"""


class NonceManager:
    def __init__(self, redis: Redis, *, key_prefix: str = "sodex:nonce") -> None:
        self._redis = redis
        self._prefix = key_prefix
        self._script = redis.register_script(_ADVANCE_SCRIPT)

    def _key(self, signing_address: str) -> str:
        return f"{self._prefix}:{signing_address.lower()}"

    async def next_nonce(self, signing_address: str) -> int:
        """Returns a nonce strictly greater than any previously issued for
        this signing address, and fast-forwarded to current time if the
        counter fell behind (e.g. after a restart)."""
        now_ms = int(time.time() * 1000)
        result = await self._script(keys=[self._key(signing_address)], args=[now_ms])
        return int(result)

    async def peek(self, signing_address: str) -> int:
        val = await self._redis.get(self._key(signing_address))
        return int(val) if val is not None else 0

    async def reset(self, signing_address: str, value: int | None = None) -> None:
        """Escape hatch for operator intervention (e.g. after a nonce
        desync). Defaults to current time in ms."""
        val = value if value is not None else int(time.time() * 1000)
        await self._redis.set(self._key(signing_address), val)
