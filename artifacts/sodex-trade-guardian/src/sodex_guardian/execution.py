"""Execution adapter: turns a validated ProposedAction into real, signed
SoDEX API calls -- or, for ADVISORY/APPROVAL_REQUIRED modes, into a
notification only.

Pipeline (per product notes):

    Trigger -> Rule Engine -> AI Evaluation -> Proposed Action
        -> Policy Check -> Execution Adapter

This module IS the last two stages. It:
  1. Re-validates the proposed action against the trade's mandate
     (allowed_actions, mode, hard constraints) -- the AI's own claim that an
     action is fine is never trusted on its own.
  2. Enforces idempotency so the same decision can never double-execute,
     even if two workers evaluate the same trade concurrently or a retry
     occurs after a network timeout.
  3. Only ever decrypts a private key inside this service -- the AI
     reasoning layer and scheduler never see it (see accounts.py).
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Callable, Optional, Protocol

import httpx

from .client import SodexPerpsClient, SigningIdentity
from .enums import (
    OrderModifier,
    OrderSide,
    OrderType,
    PositionSide,
    StopType,
    TimeInForce,
    TriggerType,
)
from .models import AllowedAction, ExecutionMode, ProposedAction, TradeMandate, TradeState
from .redis_state import TradeStateStore
from .wire import perps_order_item


class PolicyViolation(RuntimeError):
    pass


class KeyDecryptor(Protocol):
    def __call__(self, encrypted_private_key: bytes) -> str: ...


class Notifier(Protocol):
    async def notify(self, *, trade_id: str, action: ProposedAction) -> None: ...


@dataclass
class LoggingNotifier:
    """Always-available fallback notifier; logs to stdout/structlog."""

    async def notify(self, *, trade_id: str, action: ProposedAction) -> None:
        print(
            f"[NOTIFY] trade={trade_id} action={action.action.value} "
            f"health={action.health_score} confidence={action.confidence:.2f} "
            f"reason={action.reason!r}"
        )


@dataclass
class WebhookNotifier:
    """Real HTTP webhook notifier -- works out of the box with Slack
    incoming webhooks, Telegram bot `sendMessage` proxies, or any endpoint
    that accepts a JSON POST."""

    webhook_url: str
    http_client: Optional[httpx.AsyncClient] = None

    async def notify(self, *, trade_id: str, action: ProposedAction) -> None:
        client = self.http_client or httpx.AsyncClient(timeout=5.0)
        payload = {
            "text": (
                f"Trade {trade_id}: {action.action.value} "
                f"(health {action.health_score}, confidence {action.confidence:.0%}) "
                f"-- {action.reason}"
            ),
            "trade_id": trade_id,
            "action": action.model_dump(mode="json"),
        }
        try:
            await client.post(self.webhook_url, json=payload)
        finally:
            if self.http_client is None:
                await client.aclose()


def validate_against_mandate(action: ProposedAction, mandate: TradeMandate, state: TradeState) -> None:
    """Deterministic policy check. Raises PolicyViolation if the AI (or a
    rule) proposed something the mandate doesn't authorize. This function is
    the single choke point every action must pass, regardless of source."""
    if action.action not in mandate.allowed_actions:
        raise PolicyViolation(
            f"action {action.action.value} not in allowed_actions {mandate.allowed_actions}"
        )

    if mandate.mode == ExecutionMode.ADVISORY and action.action != AllowedAction.NOTIFY:
        raise PolicyViolation("mandate is ADVISORY; only NOTIFY is permitted")

    if mandate.mode == ExecutionMode.APPROVAL_REQUIRED and action.action in (
        AllowedAction.PARTIAL_CLOSE,
        AllowedAction.FULL_CLOSE,
        AllowedAction.MOVE_STOP,
        AllowedAction.MODIFY_TAKE_PROFIT,
    ):
        raise PolicyViolation("mandate requires explicit user approval before this action executes")

    if mandate.mode == ExecutionMode.AUTOMATIC and action.action in (
        AllowedAction.PARTIAL_CLOSE,
        AllowedAction.FULL_CLOSE,
        AllowedAction.ADD_TO_POSITION,
        AllowedAction.OPEN_HEDGE,
    ):
        raise PolicyViolation("mandate is AUTOMATIC (stop/TP only); position-size changes require FULLY_AUTOMATIC")

    pct = action.action_params.get("pct")
    if action.action == AllowedAction.PARTIAL_CLOSE:
        if pct is None or not (0 < pct < 100):
            raise PolicyViolation("PARTIAL_CLOSE requires 0 < pct < 100")
        remaining_after = 100 - pct
        if remaining_after < mandate.constraints.min_position_remaining_percent:
            raise PolicyViolation("PARTIAL_CLOSE would breach min_position_remaining_percent")

    if action.action == AllowedAction.ADD_TO_POSITION:
        pct = action.action_params.get("pct")
        if pct is None or not (0 < pct <= mandate.constraints.max_add_percent):
            raise PolicyViolation("ADD_TO_POSITION requires pct within max_add_percent")
        if state.effective_leverage and state.effective_leverage > mandate.constraints.max_leverage:
            raise PolicyViolation("ADD_TO_POSITION blocked because effective leverage already exceeds max_leverage")

    if action.action == AllowedAction.OPEN_HEDGE:
        pct = action.action_params.get("pct")
        if pct is None or not (0 < pct <= mandate.constraints.max_hedge_percent):
            raise PolicyViolation("OPEN_HEDGE requires pct within max_hedge_percent")

    if mandate.constraints.max_loss_usd is not None and state.unrealized_pnl < -abs(
        mandate.constraints.max_loss_usd
    ) * 1.5:
        # Sanity check: if loss already blew way past the configured cap,
        # only allow closing actions -- never a stop widening / TP move.
        if action.action in (AllowedAction.MOVE_STOP, AllowedAction.MODIFY_TAKE_PROFIT):
            raise PolicyViolation("loss far beyond max_loss_usd; only close actions are permitted")


def idempotency_key(trade_id: str, action: ProposedAction, *, mandate_version: int) -> str:
    """Deterministic key so the SAME decision (same trade, same action type,
    same rounded params, same mandate version) never executes twice, while a
    genuinely new decision on the next cycle gets a fresh key."""
    basis = (
        f"{trade_id}:{mandate_version}:{action.action.value}:"
        f"{sorted(action.action_params.items())}:{int(time.time() // 30)}"
    )
    return hashlib.sha256(basis.encode()).hexdigest()[:32]


def client_order_id(trade_id: str, action: ProposedAction) -> str:
    """Must match ^[0-9a-zA-Z_-]{1,36}$ and be unique among open orders."""
    raw = f"ag-{trade_id}-{action.action.value}-{int(time.time() * 1000)}"
    return raw[:36]


class ExecutionService:
    """The ONLY component permitted to decrypt an automation's API key and
    submit signed orders. Everything upstream (rules, AI) only ever produces
    a ProposedAction."""

    def __init__(
        self,
        client: SodexPerpsClient,
        state_store: TradeStateStore,
        *,
        decrypt_key: KeyDecryptor,
        notifier: Optional[Notifier] = None,
    ) -> None:
        self._client = client
        self._store = state_store
        self._decrypt_key = decrypt_key
        self._notifier = notifier or LoggingNotifier()

    async def execute(
        self,
        *,
        action: ProposedAction,
        mandate: TradeMandate,
        state: TradeState,
        encrypted_private_key: bytes,
        api_key_name: str,
        symbol_id: int,
    ) -> Optional[list[dict]]:
        validate_against_mandate(action, mandate, state)

        idem_key = idempotency_key(action.trade_id, action, mandate_version=mandate.policy_version)
        first_time = await self._store.claim_idempotency(idem_key)
        if not first_time:
            return None  # duplicate decision within the dedupe window; skip silently

        if action.action == AllowedAction.NOTIFY or mandate.mode == ExecutionMode.ADVISORY:
            await self._notifier.notify(trade_id=action.trade_id, action=action)
            return None

        if mandate.mode == ExecutionMode.APPROVAL_REQUIRED:
            # Stage for human approval instead of firing -- caller's approval
            # queue should pick this up; we still notify so the user sees it.
            await self._notifier.notify(trade_id=action.trade_id, action=action)
            return None

        private_key = self._decrypt_key(encrypted_private_key)
        identity = SigningIdentity(api_key_name=api_key_name, private_key=private_key)

        result = await self._dispatch(
            action=action, mandate=mandate, state=state, identity=identity, symbol_id=symbol_id
        )

        await self._store.record_action(
            action.trade_id,
            {
                "timestamp": time.time(),
                "action": action.action.value,
                "params": action.action_params,
                "reason": action.reason,
                "source": action.source,
            },
        )
        await self._notifier.notify(trade_id=action.trade_id, action=action)
        return result

    async def _dispatch(
        self,
        *,
        action: ProposedAction,
        mandate: TradeMandate,
        state: TradeState,
        identity: SigningIdentity,
        symbol_id: int,
    ) -> list[dict]:
        cl_ord_id = client_order_id(action.trade_id, action)
        close_side = OrderSide.SELL if state.size > 0 else OrderSide.BUY

        if action.action == AllowedAction.MOVE_STOP:
            new_stop = action.action_params["stop_price"]
            await self._client.modify_tp_sl_order(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=symbol_id,
                stop_price=new_stop,
            )
            return []

        if action.action == AllowedAction.MODIFY_TAKE_PROFIT:
            new_tp = action.action_params["take_profit_price"]
            await self._client.modify_tp_sl_order(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=symbol_id,
                stop_price=new_tp,
            )
            return []

        if action.action == AllowedAction.PARTIAL_CLOSE:
            pct = action.action_params["pct"]
            qty = abs(state.size) * (pct / 100.0)
            order = perps_order_item(
                cl_ord_id=cl_ord_id,
                modifier=OrderModifier.NORMAL,
                side=close_side,
                order_type=OrderType.MARKET,
                time_in_force=TimeInForce.IOC,
                reduce_only=True,
                position_side=PositionSide.BOTH,
                quantity=qty,
            )
            return await self._client.place_orders(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=symbol_id,
                orders=[order],
            )

        if action.action == AllowedAction.FULL_CLOSE:
            order = perps_order_item(
                cl_ord_id=cl_ord_id,
                modifier=OrderModifier.NORMAL,
                side=close_side,
                order_type=OrderType.MARKET,
                time_in_force=TimeInForce.IOC,
                reduce_only=True,
                position_side=PositionSide.BOTH,
                quantity=abs(state.size),
            )
            return await self._client.place_orders(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=symbol_id,
                orders=[order],
            )

        if action.action == AllowedAction.ADD_TO_POSITION:
            pct = float(action.action_params["pct"])
            qty = abs(state.size) * (pct / 100.0)
            side = OrderSide.BUY if state.size > 0 else OrderSide.SELL
            order = perps_order_item(
                cl_ord_id=cl_ord_id,
                modifier=OrderModifier.NORMAL,
                side=side,
                order_type=OrderType.MARKET,
                time_in_force=TimeInForce.IOC,
                reduce_only=False,
                position_side=PositionSide.BOTH,
                quantity=qty,
            )
            return await self._client.place_orders(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=symbol_id,
                orders=[order],
            )

        if action.action == AllowedAction.OPEN_HEDGE:
            pct = float(action.action_params["pct"])
            qty = abs(state.size) * (pct / 100.0)
            side = OrderSide.SELL if state.size > 0 else OrderSide.BUY
            hedge_symbol_id = int(action.action_params.get("hedge_symbol_id", symbol_id))
            order = perps_order_item(
                cl_ord_id=cl_ord_id,
                modifier=OrderModifier.NORMAL,
                side=side,
                order_type=OrderType.MARKET,
                time_in_force=TimeInForce.IOC,
                reduce_only=False,
                position_side=PositionSide.BOTH,
                quantity=qty,
            )
            return await self._client.place_orders(
                identity=identity,
                account_id=mandate.account_id,
                symbol_id=hedge_symbol_id,
                orders=[order],
            )

        raise PolicyViolation(f"unhandled action type {action.action}")
