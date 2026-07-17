"""A minimal, real (Fernet-encrypted) automation repository backed by Redis.

This is intentionally simple -- swap it for Postgres/whatever you already
run in production. What matters is the contract: the execution service
(execution.py) must NEVER see a plaintext private key outside the moment it
calls `decrypt_key`, and this repository is the only place a ciphertext is
ever written or read.
"""
from __future__ import annotations

import json

from cryptography.fernet import Fernet
from redis.asyncio import Redis

from .accounts import GeneratedApiKey, SubAccountAutomation


class RedisAutomationRepository:
    def __init__(self, redis: Redis, *, encryption_key: str) -> None:
        if not encryption_key:
            raise ValueError(
                "ENCRYPTION_KEY is required -- generate one with "
                "Fernet.generate_key() and set it in your environment"
            )
        self._redis = redis
        self._fernet = Fernet(encryption_key.encode())

    @staticmethod
    def _key(trade_id: str) -> str:
        return f"automation:trade:{trade_id}"

    async def register(
        self,
        *,
        trade_id: str,
        symbol_id: int,
        automation: SubAccountAutomation,
        generated_key: GeneratedApiKey,
    ) -> None:
        """Encrypts the private key and links it to a trade_id so the
        scheduler/execution service can find it at decision time."""
        encrypted = self._fernet.encrypt(generated_key.private_key.encode())
        payload = {
            "encrypted_private_key": encrypted.decode(),
            "api_key_name": automation.api_key_name,
            "account_id": automation.account_id,
            "symbol_id": symbol_id,
        }
        await self._redis.set(self._key(trade_id), json.dumps(payload))

    async def encrypted_key_for_trade(self, trade_id: str) -> tuple[bytes, str]:
        raw = await self._redis.get(self._key(trade_id))
        if not raw:
            raise KeyError(f"no automation registered for trade {trade_id}")
        payload = json.loads(raw)
        return payload["encrypted_private_key"].encode(), payload["api_key_name"]

    async def symbol_id_for_trade(self, trade_id: str) -> int:
        raw = await self._redis.get(self._key(trade_id))
        if not raw:
            raise KeyError(f"no automation registered for trade {trade_id}")
        return int(json.loads(raw)["symbol_id"])

    def decrypt_key(self, encrypted_private_key: bytes) -> str:
        return self._fernet.decrypt(encrypted_private_key).decode()
