"""Batched AI trade-decision engine ("AI Trade Guardian").

Only trades that `rules.evaluate()` marked NEEDS_AI ever reach here. Trades
are grouped by shared market context (symbol + strategy) upstream in
batch_engine.py, so one call can reason over many trades that share the same
market snapshot instead of issuing one model call per trade.

Uses the real Anthropic Messages API with forced tool use so the model
returns a strictly-typed batch of decisions instead of freeform text that
would need brittle parsing. No mocked responses -- this hits the network.
"""
from __future__ import annotations

import json
from typing import Any

from anthropic import AsyncAnthropic

from .models import AllowedAction, ProposedAction, TradeDecisionInput

_TOOL_NAME = "propose_trade_actions"

_TOOL_SCHEMA = {
    "name": _TOOL_NAME,
    "description": (
        "Propose a risk-management action for each trade in the batch, or "
        "NOTIFY with no material action if the trade is still healthy. "
        "Every action must be justified and stay within the trade's "
        "allowed_actions and mode."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "trade_id": {"type": "string"},
                        "action": {
                            "type": "string",
                            "enum": [a.value for a in AllowedAction],
                        },
                        "action_params": {"type": "object"},
                        "reason": {
                            "type": "string",
                            "description": "Concrete, specific justification citing the signals used.",
                        },
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "health_score": {"type": "integer", "minimum": 0, "maximum": 100},
                    },
                    "required": [
                        "trade_id",
                        "action",
                        "reason",
                        "confidence",
                        "health_score",
                    ],
                },
            }
        },
        "required": ["decisions"],
    },
}

_SYSTEM_PROMPT = """\
You are the risk-management reasoning layer of a non-custodial perpetuals \
trading automation platform (SoDEX). You NEVER execute anything directly -- \
you only propose an action per trade, which a separate deterministic policy \
layer validates against hard constraints before anything reaches the \
exchange.

For each trade in the batch, weigh: price action relative to entry/stop/\
liquidation, funding rate, open interest trend, leader-wallet activity, \
volatility, and any block-intelligence signals provided. Only propose an \
action from the trade's `allowed_actions` list, and never propose an action \
inconsistent with the trade's `mode` (ADVISORY mode should almost always \
resolve to NOTIFY). If nothing warrants intervention, propose NOTIFY with a \
short reason and a health_score reflecting current risk. Be conservative: \
partial or full closes require a clearly stated, specific trigger, not \
vague concern.
"""


class AIBatchDecisionEngine:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def decide_batch(
        self, items: list[TradeDecisionInput], *, shared_market_context: dict[str, Any]
    ) -> list[ProposedAction]:
        if not items:
            return []

        batch_payload = {
            "shared_market_context": shared_market_context,
            "trades": [
                {
                    "trade_id": i.trade_id,
                    "objective": i.mandate.objective.value,
                    "mode": i.mandate.mode.value,
                    "allowed_actions": [a.value for a in i.mandate.allowed_actions],
                    "constraints": i.mandate.constraints.model_dump(),
                    "user_instructions": i.mandate.user_instructions,
                    "state": i.state.model_dump(),
                    "market_context": i.market_context,
                    "wallet_context": i.wallet_context,
                }
                for i in items
            ],
        }

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            tools=[_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Evaluate this batch of trades and call "
                        f"{_TOOL_NAME} with your decisions.\n\n"
                        f"{json.dumps(batch_payload, separators=(',', ':'))}"
                    ),
                }
            ],
        )

        decisions: list[ProposedAction] = []
        by_id = {i.trade_id: i for i in items}
        for block in response.content:
            if block.type != "tool_use" or block.name != _TOOL_NAME:
                continue
            for raw in block.input.get("decisions", []):
                trade_id = raw.get("trade_id")
                if trade_id not in by_id:
                    continue  # ignore hallucinated trade ids defensively
                try:
                    decisions.append(
                        ProposedAction(
                            trade_id=trade_id,
                            action=AllowedAction(raw["action"]),
                            action_params=raw.get("action_params", {}) or {},
                            reason=raw["reason"],
                            confidence=float(raw["confidence"]),
                            health_score=int(raw["health_score"]),
                            source="AI",
                        )
                    )
                except (KeyError, ValueError):
                    continue  # skip malformed entries rather than fail the whole batch
        return decisions
