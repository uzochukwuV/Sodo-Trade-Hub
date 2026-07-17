"""Batch coordinator -- the funnel described in the product notes:

    10,000 monitored trades
        -> group by market and strategy
        -> fetch shared market intelligence once
        -> evaluate deterministic triggers
        -> send only relevant trades to AI
        -> produce structured decisions in batches
        -> validate each decision independently
        -> execute approved actions idempotently
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass

from .ai_engine import AIBatchDecisionEngine
from .client import SodexPerpsClient
from .models import MonitoringPriority, ProposedAction, TradeDecisionInput
from .redis_state import TradeStateStore
from .rules import Resolution, derive_priority, evaluate


@dataclass
class BatchResult:
    hard_stops: list[ProposedAction]
    ai_decisions: list[ProposedAction]
    no_action_count: int
    blocked_count: int


class BatchCoordinator:
    def __init__(
        self,
        client: SodexPerpsClient,
        store: TradeStateStore,
        ai_engine: AIBatchDecisionEngine,
        *,
        ai_batch_size: int = 20,
    ) -> None:
        self._client = client
        self._store = store
        self._ai = ai_engine
        self._ai_batch_size = ai_batch_size

    async def run_cycle(self) -> BatchResult:
        due_trade_ids = await self._store.due_trades()
        if not due_trade_ids:
            return BatchResult([], [], 0, 0)

        items = await self._load_items(due_trade_ids)
        groups = self._group_by_symbol(items)

        hard_stops: list[ProposedAction] = []
        needs_ai: list[TradeDecisionInput] = []
        no_action = 0
        blocked = 0
        now_ms = int(time.time() * 1000)

        for symbol, group_items in groups.items():
            snapshot = await self._fetch_shared_context(symbol)
            data_age_ms = now_ms - int(snapshot.get("fetched_at_ms", now_ms))

            for item in group_items:
                item.market_context = snapshot
                outcome = evaluate(item, market_data_age_ms=data_age_ms, now_ms=now_ms)

                new_priority = derive_priority(item.state)
                delay = self._store.next_eval_delay_ms(new_priority)

                if outcome.resolution == Resolution.HARD_STOP:
                    hard_stops.append(outcome.action)  # type: ignore[arg-type]
                    await self._store.reschedule(item.trade_id, delay)
                elif outcome.resolution == Resolution.BLOCKED:
                    blocked += 1
                    await self._store.reschedule(item.trade_id, delay)
                elif outcome.resolution == Resolution.NO_ACTION:
                    no_action += 1
                    await self._store.reschedule(item.trade_id, delay)
                else:  # NEEDS_AI
                    needs_ai.append(item)
                    await self._store.reschedule(item.trade_id, delay)

        ai_decisions: list[ProposedAction] = []
        for chunk_start in range(0, len(needs_ai), self._ai_batch_size):
            chunk = needs_ai[chunk_start : chunk_start + self._ai_batch_size]
            if not chunk:
                continue
            shared_ctx = chunk[0].market_context
            decisions = await self._ai.decide_batch(chunk, shared_market_context=shared_ctx)
            ai_decisions.extend(decisions)

        return BatchResult(
            hard_stops=hard_stops,
            ai_decisions=ai_decisions,
            no_action_count=no_action,
            blocked_count=blocked,
        )

    async def _load_items(self, trade_ids: list[str]) -> list[TradeDecisionInput]:
        items: list[TradeDecisionInput] = []
        for trade_id in trade_ids:
            state = await self._store.load_state(trade_id)
            mandate = await self._store.load_mandate(trade_id)
            if state is None or mandate is None:
                continue
            wallet_ctx: dict = {}
            for rule in mandate.rules:
                addr = rule.action_params.get("wallet_address")
                if addr:
                    activity = await self._store.get_wallet_activity(addr)
                    if activity:
                        wallet_ctx[addr] = activity
            items.append(
                TradeDecisionInput(
                    trade_id=trade_id, mandate=mandate, state=state, wallet_context=wallet_ctx
                )
            )
        return items

    @staticmethod
    def _group_by_symbol(
        items: list[TradeDecisionInput],
    ) -> dict[str, list[TradeDecisionInput]]:
        groups: dict[str, list[TradeDecisionInput]] = defaultdict(list)
        for item in items:
            groups[item.state.symbol].append(item)
        return groups

    async def _fetch_shared_context(self, symbol: str) -> dict:
        cached = await self._store.get_market_snapshot(symbol)
        if cached:
            return cached

        mark = await self._client.get_mark_prices(symbol)
        ticker = await self._client.get_tickers(symbol)
        snapshot = {
            "symbol": symbol,
            "fetched_at_ms": int(time.time() * 1000),
            "mark_price_data": mark,
            "ticker_data": ticker,
        }
        await self._store.cache_market_snapshot(symbol, snapshot)
        return snapshot
