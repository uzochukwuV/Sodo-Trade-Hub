"""Example: compile a natural-language protection request into a structured
TradeMandate and register it for continuous batched evaluation.

This mirrors the product notes:
    "Protect this BTC long. Trail the stop when momentum is strong, close
    half if the lead wallet exits, and never risk more than 3% of my
    account." -> compiled once into a TradeMandate.

Compiling free text into the structured mandate is itself a good use of the
Anthropic API (structured extraction), reusing the same tool-calling pattern
as ai_engine.py -- left as an exercise / extension point; this script shows
the structured form directly so the rest of the pipeline can be exercised
without requiring a live position.
"""
from __future__ import annotations

import argparse
import asyncio
import time

from redis.asyncio import Redis

from sodex_guardian.config import get_settings
from sodex_guardian.models import (
    AllowedAction,
    AutomationRule,
    ExecutionMode,
    MandateConstraints,
    MonitoringPriority,
    Objective,
    TradeMandate,
    TradeState,
)
from sodex_guardian.redis_state import TradeStateStore


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trade-id", required=True)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--automation-id", required=True)
    parser.add_argument("--account-id", type=int, required=True)
    parser.add_argument("--symbol", required=True, help="e.g. BTC-USD")
    parser.add_argument("--symbol-id", type=int, required=True)
    parser.add_argument("--size", type=float, required=True, help="signed: +long / -short")
    parser.add_argument("--entry-price", type=float, required=True)
    parser.add_argument("--mark-price", type=float, required=True)
    parser.add_argument("--stop-loss", type=float, default=None)
    parser.add_argument("--mode", default="ADVISORY", choices=[m.value for m in ExecutionMode])
    args = parser.parse_args()

    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    store = TradeStateStore(redis)

    mandate = TradeMandate(
        trade_id=args.trade_id,
        user_id=args.user_id,
        automation_id=args.automation_id,
        account_id=args.account_id,
        objective=Objective.PROTECT,
        mode=ExecutionMode(args.mode),
        allowed_actions=[
            AllowedAction.NOTIFY,
            AllowedAction.MOVE_STOP,
            AllowedAction.PARTIAL_CLOSE,
        ],
        constraints=MandateConstraints(max_loss_percent=3.0, max_actions_per_hour=6),
        rules=[
            AutomationRule(
                rule_id="r1",
                condition="if trade profit > 8% and funding rising then sell 25%",
                action=AllowedAction.PARTIAL_CLOSE,
                action_params={"pct": 25, "trigger": "profit>8%,funding_rising"},
            )
        ],
        user_instructions=(
            "Protect this position. Trail the stop when momentum is strong, "
            "close 25% if profit exceeds 8% and funding is rising, and never "
            "risk more than 3% of account equity."
        ),
    )
    await store.save_mandate(mandate)

    state = TradeState(
        trade_id=args.trade_id,
        account_id=args.account_id,
        symbol_id=args.symbol_id,
        symbol=args.symbol,
        position_side=1,
        size=args.size,
        entry_price=args.entry_price,
        mark_price=args.mark_price,
        stop_loss=args.stop_loss,
        priority=MonitoringPriority.NORMAL,
        next_evaluation_at_ms=int(time.time() * 1000),
    )
    await store.save_state(state)

    print(f"Registered mandate + state for trade {args.trade_id}. It will be "
          f"picked up on the next scheduler cycle.")

    await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
