"""Compile user strategy prompts into structured TradeMandates.

The raw prompt is useful for context, but execution must be governed by a
stable, auditable mandate. This module keeps that boundary explicit:

    natural-language strategy -> structured rules -> monitored/evaluated forever
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic

from .models import (
    AllowedAction,
    AutomationRule,
    ConditionKind,
    ExecutionMode,
    MandateConstraints,
    MonitoringFlags,
    Objective,
    TradeMandate,
)


_COMPILER_TOOL = {
    "name": "compile_trade_mandate",
    "description": "Compile a live-trade automation prompt into a strict mandate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "objective": {"type": "string", "enum": [o.value for o in Objective]},
            "mode": {"type": "string", "enum": [m.value for m in ExecutionMode]},
            "monitoring": {
                "type": "object",
                "properties": {
                    "price": {"type": "boolean"},
                    "funding": {"type": "boolean"},
                    "open_interest": {"type": "boolean"},
                    "wallet_activity": {"type": "boolean"},
                    "block_clusters": {"type": "boolean"},
                    "volatility": {"type": "boolean"},
                    "correlated_markets": {"type": "boolean"},
                    "portfolio_exposure": {"type": "boolean"},
                },
            },
            "allowed_actions": {
                "type": "array",
                "items": {"type": "string", "enum": [a.value for a in AllowedAction]},
            },
            "constraints": {"type": "object"},
            "rules": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": [k.value for k in ConditionKind]},
                        "condition": {"type": "string"},
                        "action": {"type": "string", "enum": [a.value for a in AllowedAction]},
                        "action_params": {"type": "object"},
                        "deterministic": {"type": "boolean"},
                        "requires_ai": {"type": "boolean"},
                        "priority": {"type": "integer", "minimum": 1, "maximum": 100},
                    },
                    "required": ["kind", "condition", "action"],
                },
            },
        },
        "required": ["objective", "mode", "allowed_actions", "rules"],
    },
}


_SYSTEM = """\
You compile user-written trade automation prompts into structured mandates.
The output is not advice. It is an executable policy draft that another
service validates before any action. Hard risk limits should be deterministic.
Ambiguous contextual strategies should set requires_ai=true. Default to
ADVISORY or APPROVAL_REQUIRED unless the user explicitly asked for automatic
execution. Never include WITHDRAW or TRANSFER behavior.
"""


def _pct(pattern: str, text: str) -> Optional[float]:
    match = re.search(pattern, text, flags=re.I)
    return float(match.group(1)) if match else None


def _rule(
    kind: ConditionKind,
    condition: str,
    action: AllowedAction,
    *,
    params: Optional[dict[str, Any]] = None,
    deterministic: bool = False,
    requires_ai: bool = False,
    priority: int = 50,
) -> AutomationRule:
    return AutomationRule(
        rule_id=f"r_{uuid4().hex[:10]}",
        kind=kind,
        condition=condition,
        action=action,
        action_params=params or {},
        deterministic=deterministic,
        requires_ai=requires_ai,
        priority=priority,
    )


def compile_prompt_fallback(
    *,
    trade_id: str,
    user_id: str,
    automation_id: str,
    account_id: int,
    prompt: str,
    symbol: Optional[str] = None,
    symbol_id: Optional[int] = None,
    wallet_address: Optional[str] = None,
    default_mode: ExecutionMode = ExecutionMode.ADVISORY,
) -> TradeMandate:
    """Keyword compiler for development and deterministic tests.

    It deliberately keeps ambiguous conditions as AI-required rules while
    compiling hard risk and simple trigger rules into deterministic checks.
    """
    text = prompt.lower()
    mode = default_mode
    if "fully automatic" in text or "auto close" in text or "automatically" in text:
        mode = ExecutionMode.AUTOMATIC
    if "approval" in text or "ask me" in text:
        mode = ExecutionMode.APPROVAL_REQUIRED

    monitoring = MonitoringFlags(
        wallet_activity=any(w in text for w in ["wallet", "elite", "alpha", "copy"]),
        block_clusters=any(w in text for w in ["cluster", "block intelligence", "exit cluster"]),
        correlated_markets=any(w in text for w in ["correlated", "eth dumps", "btc dumps"]),
        portfolio_exposure=any(w in text for w in ["portfolio", "exposure", "correlation netting"]),
    )

    constraints = MandateConstraints()
    loss_pct = _pct(r"(?:lose|loss|risk|drawdown)[^\d]*(\d+(?:\.\d+)?)\s*%", text)
    if loss_pct:
        constraints.max_loss_percent = loss_pct
    lev = _pct(r"(?:leverage|effective leverage)[^\d]*(\d+(?:\.\d+)?)x?", text)
    if lev:
        constraints.max_leverage = lev

    rules: list[AutomationRule] = []

    if "breakeven" in text or "break even" in text:
        trigger = _pct(r"(?:up|profit|gain)[^\d]*(\d+(?:\.\d+)?)\s*%", text) or 2.0
        rules.append(_rule(
            ConditionKind.BREAKEVEN_ON_TRIGGER,
            f"Move stop to breakeven once unrealized PnL reaches {trigger}%.",
            AllowedAction.MOVE_STOP,
            params={"trigger_profit_percent": trigger, "stop_price": "entry"},
            deterministic=True,
            priority=80,
        ))

    if "time stop" in text or "within" in text and "hours" in text:
        hours = _pct(r"(\d+(?:\.\d+)?)\s*hours?", text) or 6.0
        rules.append(_rule(
            ConditionKind.TIME_STOP,
            f"If target progress is weak after {hours} hours, reduce risk.",
            AllowedAction.PARTIAL_CLOSE,
            params={"after_hours": hours, "pct": 50},
            deterministic=True,
            priority=65,
        ))

    if "scale" in text or "take 25" in text or "ladder" in text:
        rules.append(_rule(
            ConditionKind.SCALE_OUT_LADDER,
            "Scale out on profit milestones and let the remainder trail.",
            AllowedAction.PARTIAL_CLOSE,
            params={"ladder": [{"profit_percent": 5, "pct": 25}, {"profit_percent": 10, "pct": 25}]},
            deterministic=True,
            priority=70,
        ))

    if "trailing" in text or "trail" in text:
        rules.append(_rule(
            ConditionKind.VOLATILITY_ADAPTIVE_STOP,
            "Maintain a trailing or volatility-adaptive stop while trade remains valid.",
            AllowedAction.MOVE_STOP,
            params={"trail_mode": "volatility_adaptive"},
            requires_ai=True,
            priority=60,
        ))

    if "funding" in text:
        rules.append(_rule(
            ConditionKind.FUNDING_DRIVEN_EXIT,
            "If funding becomes crowded, begin reducing exposure.",
            AllowedAction.PARTIAL_CLOSE,
            params={"funding_threshold": 0.0005, "pct": 25},
            requires_ai=True,
            priority=62,
        ))

    if "add" in text or "pyramid" in text:
        add_pct = _pct(r"add[^\d]*(\d+(?:\.\d+)?)\s*%", text) or 20.0
        rules.append(_rule(
            ConditionKind.ADD_ON_CONFIRMATION,
            "Add only after confirmation from market and elite-wallet context.",
            AllowedAction.ADD_TO_POSITION,
            params={"pct": min(add_pct, constraints.max_add_percent)},
            requires_ai=True,
            priority=58,
        ))

    if "hedge" in text:
        rules.append(_rule(
            ConditionKind.HEDGE_INSTEAD_OF_CLOSE,
            "Open a small hedge instead of closing when risk spikes but thesis is not invalidated.",
            AllowedAction.OPEN_HEDGE,
            params={"pct": min(25.0, constraints.max_hedge_percent)},
            requires_ai=True,
            priority=58,
        ))

    if "wallet" in text:
        rules.append(_rule(
            ConditionKind.WALLET_MIRRORING,
            "Mirror meaningful reductions or exits from watched wallets.",
            AllowedAction.PARTIAL_CLOSE,
            params={"mirror": True},
            requires_ai=True,
            priority=75,
        ))

    if "cluster" in text:
        rules.append(_rule(
            ConditionKind.CLUSTER_EXIT_RESPONSE,
            "If block intelligence detects an exit cluster, tighten stop or notify.",
            AllowedAction.MOVE_STOP,
            params={"stop_distance_percent": 1.0},
            requires_ai=True,
            priority=72,
        ))

    if "notify" in text or not rules:
        rules.append(_rule(
            ConditionKind.HEALTH_ALERT,
            "Notify if trade health deteriorates or no stronger rule applies.",
            AllowedAction.NOTIFY,
            params={"health_below": 50},
            deterministic=True,
            priority=30,
        ))

    allowed = sorted({AllowedAction.NOTIFY, *(r.action for r in rules)}, key=lambda a: a.value)

    return TradeMandate(
        trade_id=trade_id,
        user_id=user_id,
        automation_id=automation_id,
        account_id=account_id,
        wallet_address=wallet_address,
        symbol=symbol,
        symbol_id=symbol_id,
        objective=Objective.PROTECT,
        mode=mode,
        monitoring=monitoring,
        allowed_actions=allowed,
        constraints=constraints,
        rules=rules,
        user_instructions=prompt,
        policy_version=1,
    )


class StrategyCompiler:
    def __init__(self, *, anthropic_api_key: str = "", model: str = "claude-sonnet-4-6") -> None:
        self._api_key = anthropic_api_key
        self._model = model

    async def compile(
        self,
        *,
        trade_id: str,
        user_id: str,
        automation_id: str,
        account_id: int,
        prompt: str,
        symbol: Optional[str] = None,
        symbol_id: Optional[int] = None,
        wallet_address: Optional[str] = None,
        default_mode: ExecutionMode = ExecutionMode.ADVISORY,
    ) -> TradeMandate:
        fallback = compile_prompt_fallback(
            trade_id=trade_id,
            user_id=user_id,
            automation_id=automation_id,
            account_id=account_id,
            prompt=prompt,
            symbol=symbol,
            symbol_id=symbol_id,
            wallet_address=wallet_address,
            default_mode=default_mode,
        )
        if not self._api_key:
            return fallback

        client = AsyncAnthropic(api_key=self._api_key)
        response = await client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=_SYSTEM,
            tools=[_COMPILER_TOOL],
            tool_choice={"type": "tool", "name": "compile_trade_mandate"},
            messages=[{
                "role": "user",
                "content": json.dumps({
                    "prompt": prompt,
                    "fallback_draft": fallback.model_dump(mode="json"),
                    "now_ms": int(time.time() * 1000),
                }, separators=(",", ":")),
            }],
        )
        for block in response.content:
            if block.type == "tool_use" and block.name == "compile_trade_mandate":
                raw = block.input
                rules = [
                    AutomationRule(
                        rule_id=f"r_{uuid4().hex[:10]}",
                        kind=ConditionKind(r.get("kind", "CUSTOM")),
                        condition=r["condition"],
                        action=AllowedAction(r["action"]),
                        action_params=r.get("action_params", {}) or {},
                        deterministic=bool(r.get("deterministic", False)),
                        requires_ai=bool(r.get("requires_ai", False)),
                        priority=int(r.get("priority", 50)),
                    )
                    for r in raw.get("rules", [])
                ]
                return fallback.model_copy(update={
                    "objective": Objective(raw.get("objective", fallback.objective.value)),
                    "mode": ExecutionMode(raw.get("mode", fallback.mode.value)),
                    "monitoring": MonitoringFlags(**raw.get("monitoring", fallback.monitoring.model_dump())),
                    "allowed_actions": [AllowedAction(a) for a in raw.get("allowed_actions", [a.value for a in fallback.allowed_actions])],
                    "constraints": MandateConstraints(**{
                        **fallback.constraints.model_dump(),
                        **raw.get("constraints", {}),
                    }),
                    "rules": rules or fallback.rules,
                })
        return fallback
