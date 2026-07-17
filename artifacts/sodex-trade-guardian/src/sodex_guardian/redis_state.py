"""Redis key layout and operations for live trade state, adaptive
scheduling, and idempotent execution -- mirrors the architecture in the
product notes:

    trade:{tradeId}:state
    trade:{tradeId}:mandate
    trade:{tradeId}:last-evaluation
    trade:{tradeId}:last-action
    market:{symbol}:snapshot
    wallet:{address}:recent-activity
    batch:{batchId}:status

    evaluation-due          (sorted set: score = nextEvaluationTimestamp)
    active-trades:{symbol}  (set)
    high-risk-trades        (set)
    approval-pending        (set)

PostgreSQL (or another durable store) remains the source of truth for the
mandate and audit log; Redis only holds the fast operational path plus a
short-TTL idempotency ledger.
"""
from __future__ import annotations

import json
import time
from typing import Iterable, Optional

from redis.asyncio import Redis

from .models import MonitoringPriority, TradeMandate, TradeState
from .models import ProposedAction

_EVAL_FREQUENCY_MS = {
    MonitoringPriority.LOW: 5 * 60_000,
    MonitoringPriority.NORMAL: 3 * 60_000,
    MonitoringPriority.HIGH: 30_000,
    MonitoringPriority.CRITICAL: 10_000,
}

_CAS_SET_IF_ABSENT = """
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
"""


class TradeStateStore:
    def __init__(self, redis: Redis) -> None:
        self._r = redis
        self._idempotency_script = redis.register_script(_CAS_SET_IF_ABSENT)

    # -- keys -----------------------------------------------------------

    @staticmethod
    def _state_key(trade_id: str) -> str:
        return f"trade:{trade_id}:state"

    @staticmethod
    def _mandate_key(trade_id: str) -> str:
        return f"trade:{trade_id}:mandate"

    @staticmethod
    def _last_action_key(trade_id: str) -> str:
        return f"trade:{trade_id}:last-action"

    @staticmethod
    def _proposed_action_key(action_id: str) -> str:
        return f"proposed-action:{action_id}"

    # -- state / mandate --------------------------------------------------

    async def save_mandate(self, mandate: TradeMandate) -> None:
        await self._r.set(self._mandate_key(mandate.trade_id), mandate.model_dump_json())

    async def load_mandate(self, trade_id: str) -> Optional[TradeMandate]:
        raw = await self._r.get(self._mandate_key(trade_id))
        return TradeMandate.model_validate_json(raw) if raw else None

    async def save_state(self, state: TradeState) -> None:
        pipe = self._r.pipeline(transaction=True)
        pipe.set(self._state_key(state.trade_id), state.model_dump_json())
        pipe.sadd(f"active-trades:{state.symbol}", state.trade_id)
        pipe.zadd("evaluation-due", {state.trade_id: state.next_evaluation_at_ms})
        if state.priority == MonitoringPriority.CRITICAL:
            pipe.sadd("high-risk-trades", state.trade_id)
        else:
            pipe.srem("high-risk-trades", state.trade_id)
        await pipe.execute()

    async def load_state(self, trade_id: str) -> Optional[TradeState]:
        raw = await self._r.get(self._state_key(trade_id))
        return TradeState.model_validate_json(raw) if raw else None

    async def deactivate(self, trade_id: str, symbol: str) -> None:
        """Position closed -> stop scheduling this trade for evaluation."""
        pipe = self._r.pipeline(transaction=True)
        pipe.delete(self._state_key(trade_id))
        pipe.srem(f"active-trades:{symbol}", trade_id)
        pipe.zrem("evaluation-due", trade_id)
        pipe.srem("high-risk-trades", trade_id)
        await pipe.execute()

    # -- scheduling -------------------------------------------------------

    @staticmethod
    def next_eval_delay_ms(priority: MonitoringPriority) -> int:
        return _EVAL_FREQUENCY_MS[priority]

    async def due_trades(self, *, now_ms: Optional[int] = None, limit: int = 5000) -> list[str]:
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        return await self._r.zrangebyscore("evaluation-due", min=0, max=now, start=0, num=limit)

    async def reschedule(self, trade_id: str, delay_ms: int) -> None:
        next_at = int(time.time() * 1000) + delay_ms
        await self._r.zadd("evaluation-due", {trade_id: next_at})

    async def bump_priority_now(self, trade_id: str) -> None:
        """Immediate re-evaluation trigger, e.g. a followed wallet just acted."""
        await self._r.zadd("evaluation-due", {trade_id: int(time.time() * 1000)})

    # -- rate limiting / cooldown ------------------------------------------

    async def actions_in_last_hour(self, trade_id: str) -> int:
        key = f"trade:{trade_id}:actions-hour"
        val = await self._r.get(key)
        return int(val) if val else 0

    async def record_action(self, trade_id: str, action_summary: dict) -> None:
        hour_key = f"trade:{trade_id}:actions-hour"
        pipe = self._r.pipeline(transaction=True)
        pipe.incr(hour_key)
        pipe.expire(hour_key, 3600)
        pipe.set(self._last_action_key(trade_id), json.dumps(action_summary))
        await pipe.execute()

    async def save_proposed_action(self, action: ProposedAction) -> None:
        if not action.action_id:
            raise ValueError("ProposedAction.action_id is required for persistence")
        pipe = self._r.pipeline(transaction=True)
        pipe.set(self._proposed_action_key(action.action_id), action.model_dump_json())
        pipe.sadd(f"trade:{action.trade_id}:proposed-actions", action.action_id)
        await pipe.execute()

    async def load_proposed_action(self, action_id: str) -> Optional[ProposedAction]:
        raw = await self._r.get(self._proposed_action_key(action_id))
        return ProposedAction.model_validate_json(raw) if raw else None

    async def proposed_actions(self, trade_id: str) -> list[ProposedAction]:
        ids = await self._r.smembers(f"trade:{trade_id}:proposed-actions")
        rows = await self._r.mget([self._proposed_action_key(i) for i in ids]) if ids else []
        return [ProposedAction.model_validate_json(r) for r in rows if r]

    async def seconds_since_last_action(self, trade_id: str) -> Optional[float]:
        raw = await self._r.get(self._last_action_key(trade_id))
        if not raw:
            return None
        summary = json.loads(raw)
        return time.time() - summary.get("timestamp", 0)

    # -- idempotency --------------------------------------------------------

    async def claim_idempotency(self, idempotency_key: str, *, ttl_seconds: int = 3600) -> bool:
        """Returns True iff this is the first time we've seen this key
        (i.e. safe to execute); False means a duplicate -- skip execution.
        Backed by a Lua SETNX+PX so concurrent workers can't double-fire the
        same automation decision."""
        result = await self._idempotency_script(
            keys=[f"idempotency:{idempotency_key}"],
            args=[str(time.time()), ttl_seconds * 1000],
        )
        return bool(result)

    # -- market/wallet context caches ---------------------------------------

    async def cache_market_snapshot(self, symbol: str, snapshot: dict, *, ttl_seconds: int = 15) -> None:
        await self._r.set(f"market:{symbol}:snapshot", json.dumps(snapshot), ex=ttl_seconds)

    async def get_market_snapshot(self, symbol: str) -> Optional[dict]:
        raw = await self._r.get(f"market:{symbol}:snapshot")
        return json.loads(raw) if raw else None

    async def cache_wallet_activity(
        self, address: str, activity: dict, *, ttl_seconds: int = 60
    ) -> None:
        await self._r.set(f"wallet:{address}:recent-activity", json.dumps(activity), ex=ttl_seconds)

    async def get_wallet_activity(self, address: str) -> Optional[dict]:
        raw = await self._r.get(f"wallet:{address}:recent-activity")
        return json.loads(raw) if raw else None

    # -- grouping helpers ------------------------------------------------

    async def trades_for_symbol(self, symbol: str) -> list[str]:
        return list(await self._r.smembers(f"active-trades:{symbol}"))

    async def all_active_symbols(self) -> list[str]:
        keys = await self._r.keys("active-trades:*")
        return [k.split(":", 1)[1] for k in keys]
