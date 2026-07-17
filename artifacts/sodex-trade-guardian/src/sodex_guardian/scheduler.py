"""Main worker loop: pulls due trades, runs the batch funnel, and executes
approved actions. Run one or more of these as independent processes
(`scripts/run_worker.py`) -- Redis's atomic due-set pop and idempotency
ledger make it safe to scale out horizontally.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Protocol

from .batch_engine import BatchCoordinator
from .client import SodexPerpsClient
from .execution import ExecutionService
from .models import ProposedAction, TradeMandate
from .redis_state import TradeStateStore

logger = logging.getLogger("sodex_guardian.scheduler")


class AutomationLookup(Protocol):
    """Bridge to your own durable store (Postgres, etc). This project does
    not ship a database -- implement this against wherever you persist the
    `SubAccountAutomation` rows from accounts.py, keyed by trade_id."""

    async def encrypted_key_for_trade(
        self, trade_id: str
    ) -> tuple[bytes, str]:  # (encrypted_private_key, api_key_name)
        ...

    async def symbol_id_for_trade(self, trade_id: str) -> int: ...


class GuardianScheduler:
    def __init__(
        self,
        coordinator: BatchCoordinator,
        execution: ExecutionService,
        store: TradeStateStore,
        automations: AutomationLookup,
        *,
        poll_interval_seconds: float = 5.0,
    ) -> None:
        self._coordinator = coordinator
        self._execution = execution
        self._store = store
        self._automations = automations
        self._poll_interval = poll_interval_seconds
        self._running = False

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            try:
                result = await self._coordinator.run_cycle()
                logger.info(
                    "cycle done: hard_stops=%d ai_decisions=%d no_action=%d blocked=%d",
                    len(result.hard_stops),
                    len(result.ai_decisions),
                    result.no_action_count,
                    result.blocked_count,
                )
                for action in [*result.hard_stops, *result.ai_decisions]:
                    await self._execute_one(action)
            except Exception:  # noqa: BLE001 -- keep the loop alive
                logger.exception("cycle failed")
            await asyncio.sleep(self._poll_interval)

    def stop(self) -> None:
        self._running = False

    async def _execute_one(self, action: ProposedAction) -> None:
        mandate = await self._store.load_mandate(action.trade_id)
        state = await self._store.load_state(action.trade_id)
        if mandate is None or state is None:
            logger.warning("skipping action for unknown trade %s", action.trade_id)
            return
        try:
            encrypted_key, api_key_name = await self._automations.encrypted_key_for_trade(
                action.trade_id
            )
            symbol_id = await self._automations.symbol_id_for_trade(action.trade_id)
            await self._execution.execute(
                action=action,
                mandate=mandate,
                state=state,
                encrypted_private_key=encrypted_key,
                api_key_name=api_key_name,
                symbol_id=symbol_id,
            )
        except Exception:  # noqa: BLE001
            logger.exception("failed to execute action for trade %s", action.trade_id)
