"""Run the batched trade-guardian worker loop.

    python scripts/run_worker.py

Scale out by running this process multiple times; Redis's atomic
`evaluation-due` pop and idempotency ledger (redis_state.py) make concurrent
workers safe -- two workers may both pick up the same trade in one cycle,
but only one of them will win the idempotency claim in execution.py.
"""
from __future__ import annotations

import asyncio
import logging

from redis.asyncio import Redis

from sodex_guardian.ai_engine import AIBatchDecisionEngine
from sodex_guardian.automation_repo import RedisAutomationRepository
from sodex_guardian.batch_engine import BatchCoordinator
from sodex_guardian.client import SodexPerpsClient
from sodex_guardian.config import get_settings
from sodex_guardian.execution import ExecutionService, WebhookNotifier
from sodex_guardian.nonce import NonceManager
from sodex_guardian.redis_state import TradeStateStore
from sodex_guardian.scheduler import GuardianScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


async def main() -> None:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)

    nonces = NonceManager(redis)
    client = SodexPerpsClient(settings, nonces)
    store = TradeStateStore(redis)
    ai_engine = AIBatchDecisionEngine(settings.anthropic_api_key, settings.anthropic_model)
    coordinator = BatchCoordinator(client, store, ai_engine, ai_batch_size=settings.ai_batch_size)

    repo = RedisAutomationRepository(redis, encryption_key=settings.encryption_key)
    notifier = WebhookNotifier(settings.notify_webhook_url) if settings.notify_webhook_url else None
    execution = ExecutionService(
        client, store, decrypt_key=repo.decrypt_key, notifier=notifier
    )

    scheduler = GuardianScheduler(coordinator, execution, store, repo, poll_interval_seconds=5.0)

    try:
        await scheduler.run_forever()
    finally:
        await client.aclose()
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
