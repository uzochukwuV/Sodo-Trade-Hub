"""Deterministic pre-filtering, per the product notes' funnel:

    5,000 due trades -> 3,900 unchanged -> 700 resolved by deterministic
    rules -> 400 require AI analysis

This module never calls the AI. It resolves the obvious cases cheaply and
flags everything else for the batched AI decision engine (ai_engine.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .models import (
    AllowedAction,
    ConditionKind,
    MonitoringPriority,
    ProposedAction,
    TradeDecisionInput,
    TradeMandate,
    TradeState,
)


class Resolution(str, Enum):
    NO_ACTION = "NO_ACTION"  # nothing changed, just reschedule
    HARD_STOP = "HARD_STOP"  # a configured stop condition fired -> execute directly
    BLOCKED = "BLOCKED"  # cooldown / stale data / closed position -> skip this cycle
    NEEDS_AI = "NEEDS_AI"  # ambiguous / conflicting signals -> send to AI


@dataclass
class RuleOutcome:
    resolution: Resolution
    action: Optional[ProposedAction] = None
    new_priority: Optional[MonitoringPriority] = None
    reason: str = ""


STALE_MARKET_DATA_MS = 30_000
PRICE_MOVE_FOR_HIGH_PRIORITY = 0.02  # 2% move since last eval
LIQUIDATION_PROXIMITY_FOR_CRITICAL = 0.10  # within 10% of liquidation price


def derive_priority(state: TradeState) -> MonitoringPriority:
    """Deterministic priority derivation from distance-to-liquidation,
    distance-to-stop, and unresolved risk -- see product notes'
    `MonitoringPriority` discussion."""
    if state.liquidation_price and state.mark_price:
        distance = abs(state.mark_price - state.liquidation_price) / state.mark_price
        if distance <= LIQUIDATION_PROXIMITY_FOR_CRITICAL:
            return MonitoringPriority.CRITICAL

    if state.stop_loss and state.mark_price:
        distance = abs(state.mark_price - state.stop_loss) / state.mark_price
        if distance <= 0.01:
            return MonitoringPriority.HIGH

    if state.health_score <= 40:
        return MonitoringPriority.HIGH
    if state.health_score <= 70:
        return MonitoringPriority.NORMAL
    return MonitoringPriority.LOW


def evaluate(
    item: TradeDecisionInput, *, market_data_age_ms: int, now_ms: int
) -> RuleOutcome:
    mandate: TradeMandate = item.mandate
    state: TradeState = item.state

    # 1. Closed position -> stop automating it entirely.
    if state.size == 0:
        return RuleOutcome(Resolution.BLOCKED, reason="position already closed")

    # 2. Stale market data -> never let automatic execution act on it.
    if market_data_age_ms > STALE_MARKET_DATA_MS and mandate.mode.value in (
        "AUTOMATIC",
        "FULLY_AUTOMATIC",
    ):
        return RuleOutcome(Resolution.BLOCKED, reason="market data stale; blocking auto-execution")

    # 3. Cooldown active -> do not modify the trade this cycle.
    seconds_since_action = (now_ms - state.last_action_at_ms) / 1000 if state.last_action_at_ms else None
    if seconds_since_action is not None and seconds_since_action < mandate.constraints.cooldown_seconds:
        return RuleOutcome(Resolution.BLOCKED, reason="cooldown active")

    # 4. Rate limit -> stop proposing new actions this hour.
    if state.actions_in_last_hour >= mandate.constraints.max_actions_per_hour:
        return RuleOutcome(Resolution.BLOCKED, reason="hourly action limit reached")

    # 5. Hard liquidation-proximity stop, independent of the AI.
    if state.liquidation_price and state.mark_price:
        distance = abs(state.mark_price - state.liquidation_price) / state.mark_price
        if distance <= 0.03 and AllowedAction.FULL_CLOSE in mandate.allowed_actions:
            action = ProposedAction(
                trade_id=state.trade_id,
                action=AllowedAction.FULL_CLOSE,
                action_params={"pct": 100},
                reason="Mark price within 3% of liquidation price; hard stop triggered.",
                confidence=1.0,
                health_score=0,
                source="DETERMINISTIC",
            )
            return RuleOutcome(Resolution.HARD_STOP, action=action, reason="liquidation proximity")

    # 6. Hard max-loss stop (account-level, deterministic, mandate-enforced).
    if mandate.constraints.max_loss_usd is not None and state.unrealized_pnl <= -abs(
        mandate.constraints.max_loss_usd
    ):
        if AllowedAction.FULL_CLOSE in mandate.allowed_actions:
            action = ProposedAction(
                trade_id=state.trade_id,
                action=AllowedAction.FULL_CLOSE,
                action_params={"pct": 100},
                reason=f"Unrealized loss breached max_loss_usd={mandate.constraints.max_loss_usd}.",
                confidence=1.0,
                health_score=0,
                source="DETERMINISTIC",
            )
            return RuleOutcome(Resolution.HARD_STOP, action=action, reason="max loss breached")

    if state.account_equity_usd and mandate.constraints.max_loss_percent is not None:
        max_loss_usd = state.account_equity_usd * (mandate.constraints.max_loss_percent / 100)
        if state.unrealized_pnl <= -abs(max_loss_usd) and AllowedAction.FULL_CLOSE in mandate.allowed_actions:
            action = ProposedAction(
                trade_id=state.trade_id,
                action=AllowedAction.FULL_CLOSE,
                action_params={"pct": 100},
                reason=(
                    "Unrealized loss breached max_loss_percent="
                    f"{mandate.constraints.max_loss_percent}% of account equity."
                ),
                confidence=1.0,
                health_score=0,
                source="DETERMINISTIC",
            )
            return RuleOutcome(Resolution.HARD_STOP, action=action, reason="max loss percent breached")

    deterministic = _evaluate_structured_rules(mandate, state, now_ms)
    if deterministic is not None:
        return deterministic

    # 7. Nothing materially changed and health is fine -> just reschedule.
    if state.health_score >= 80 and (
        not state.liquidation_price
        or abs(state.mark_price - state.liquidation_price) / state.mark_price > 0.2
    ):
        return RuleOutcome(Resolution.NO_ACTION, reason="healthy, no signals warrant AI review")

    # 8. Everything else (conflicting signals, moderate risk, wallet-following
    #    strategies, dynamic trailing decisions) needs contextual reasoning.
    return RuleOutcome(Resolution.NEEDS_AI, reason="ambiguous / contextual reasoning required")


def _evaluate_structured_rules(
    mandate: TradeMandate, state: TradeState, now_ms: int
) -> Optional[RuleOutcome]:
    """Resolve rules that are safe to evaluate without AI context."""
    for rule in sorted(mandate.rules, key=lambda r: r.priority, reverse=True):
        params = rule.action_params

        if rule.kind == ConditionKind.BREAKEVEN_ON_TRIGGER:
            trigger = float(params.get("trigger_profit_percent", 2.0))
            if state.unrealized_pnl_percent >= trigger and state.stop_loss:
                if state.position_side > 0 and state.stop_loss < state.entry_price:
                    return _action_outcome(
                        state,
                        AllowedAction.MOVE_STOP,
                        {"stop_price": state.entry_price},
                        f"Breakeven trigger reached: PnL {state.unrealized_pnl_percent:.2f}% >= {trigger:.2f}%.",
                        health=85,
                    )
                if state.position_side < 0 and state.stop_loss > state.entry_price:
                    return _action_outcome(
                        state,
                        AllowedAction.MOVE_STOP,
                        {"stop_price": state.entry_price},
                        f"Breakeven trigger reached: PnL {state.unrealized_pnl_percent:.2f}% >= {trigger:.2f}%.",
                        health=85,
                    )

        if rule.kind == ConditionKind.TIME_STOP and state.held_since_ms:
            after_hours = float(params.get("after_hours", 6.0))
            min_progress = float(params.get("min_profit_percent", 1.0))
            held_hours = (now_ms - state.held_since_ms) / 3_600_000
            if held_hours >= after_hours and state.unrealized_pnl_percent < min_progress:
                return _action_outcome(
                    state,
                    rule.action,
                    {"pct": float(params.get("pct", 50))},
                    f"Time stop fired after {held_hours:.1f}h without {min_progress:.2f}% progress.",
                    health=45,
                )

        if rule.kind == ConditionKind.SCALE_OUT_LADDER:
            ladder = params.get("ladder", [])
            if isinstance(ladder, list):
                for rung in ladder:
                    if not isinstance(rung, dict):
                        continue
                    profit = float(rung.get("profit_percent", 0))
                    pct = float(rung.get("pct", 0))
                    key = f"scale_out_{profit:g}"
                    already_done = state.market_context.get(key)
                    if not already_done and pct > 0 and state.unrealized_pnl_percent >= profit:
                        return _action_outcome(
                            state,
                            AllowedAction.PARTIAL_CLOSE,
                            {"pct": pct, "rung_key": key},
                            f"Scale-out ladder rung reached: {state.unrealized_pnl_percent:.2f}% >= {profit:.2f}%.",
                            health=80,
                        )

        if rule.kind == ConditionKind.FUNDING_DRIVEN_EXIT and state.funding_rate is not None:
            threshold = float(params.get("funding_threshold", 0.0005))
            if abs(state.funding_rate) >= threshold:
                return _action_outcome(
                    state,
                    rule.action,
                    {"pct": float(params.get("pct", 25))},
                    f"Funding crowding threshold reached: {state.funding_rate:.6f}.",
                    health=55,
                )

        if rule.kind == ConditionKind.AUTO_REDUCE_ON_LEVERAGE_CREEP and state.effective_leverage:
            max_lev = float(params.get("max_leverage", mandate.constraints.max_leverage))
            if state.effective_leverage > max_lev:
                return _action_outcome(
                    state,
                    AllowedAction.PARTIAL_CLOSE,
                    {"pct": float(params.get("pct", 20))},
                    f"Effective leverage {state.effective_leverage:.2f}x exceeded {max_lev:.2f}x.",
                    health=50,
                )

        if rule.kind == ConditionKind.HEALTH_ALERT:
            below = int(params.get("health_below", 50))
            if state.health_score <= below:
                return _action_outcome(
                    state,
                    AllowedAction.NOTIFY,
                    {"health_below": below},
                    f"Trade health dropped to {state.health_score}, below alert threshold {below}.",
                    health=state.health_score,
                )

    return None


def _action_outcome(
    state: TradeState,
    action: AllowedAction,
    params: dict,
    reason: str,
    *,
    health: int,
) -> RuleOutcome:
    proposed = ProposedAction(
        trade_id=state.trade_id,
        action=action,
        action_params=params,
        reason=reason,
        confidence=1.0,
        health_score=max(0, min(100, health)),
        source="DETERMINISTIC",
    )
    return RuleOutcome(Resolution.HARD_STOP, action=proposed, reason=reason)
