"""Standalone HTTP backend for SoDEX Trade Guardian.

This API is intentionally separate from the analytics app. It owns live-trade
automation: prompt compilation, mandate storage, trade-state updates,
deterministic/AI evaluation, approvals, and action staging.
"""
from __future__ import annotations

import hashlib
import time
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from .ai_engine import AIBatchDecisionEngine
from .compiler import StrategyCompiler
from .config import get_settings
from .models import (
    ExecutionMode,
    ProposedAction,
    TradeDecisionInput,
    TradeMandate,
    TradeState,
)
from .redis_state import TradeStateStore
from .rules import Resolution, evaluate


settings = get_settings()
redis = Redis.from_url(settings.redis_url, decode_responses=True)
store = TradeStateStore(redis)
compiler = StrategyCompiler(
    anthropic_api_key=settings.anthropic_api_key,
    model=settings.anthropic_model,
)
ai_engine = AIBatchDecisionEngine(settings.anthropic_api_key, settings.anthropic_model) if settings.anthropic_api_key else None

app = FastAPI(title="SoDEX Trade Guardian", version="0.2.0")


class CompileRequest(BaseModel):
    trade_id: str = Field(default_factory=lambda: f"trade_{uuid4().hex[:10]}")
    user_id: str
    automation_id: str = Field(default_factory=lambda: f"auto_{uuid4().hex[:10]}")
    account_id: int
    prompt: str
    symbol: Optional[str] = None
    symbol_id: Optional[int] = None
    wallet_address: Optional[str] = None
    default_mode: ExecutionMode = ExecutionMode.ADVISORY


class CreateAutomationRequest(CompileRequest):
    initial_state: Optional[TradeState] = None


class EvaluateRequest(BaseModel):
    market_data_age_ms: int = 0
    use_ai: bool = True


class ApproveRequest(BaseModel):
    approved: bool = True
    reviewer_id: Optional[str] = None


def _action_id(action: ProposedAction, mandate: TradeMandate) -> str:
    basis = [
        action.trade_id,
        mandate.policy_version,
        action.action.value,
        sorted(action.action_params.items()),
        int(time.time() // 30),
    ]
    return "act_" + hashlib.sha256(repr(basis).encode()).hexdigest()[:24]


async def _save_actions(actions: list[ProposedAction], mandate: TradeMandate) -> list[ProposedAction]:
    saved: list[ProposedAction] = []
    for action in actions:
        if not action.action_id:
            action.action_id = _action_id(action, mandate)
        action.requires_approval = mandate.mode == ExecutionMode.APPROVAL_REQUIRED
        if mandate.mode == ExecutionMode.APPROVAL_REQUIRED:
            action.status = "PROPOSED"
        await store.save_proposed_action(action)
        saved.append(action)
    return saved


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "network": settings.sodex_network,
        "mode": "standalone-guardian",
        "aiConfigured": bool(settings.anthropic_api_key),
    }


@app.post("/compile")
async def compile_strategy(req: CompileRequest) -> dict:
    mandate = await compiler.compile(
        trade_id=req.trade_id,
        user_id=req.user_id,
        automation_id=req.automation_id,
        account_id=req.account_id,
        prompt=req.prompt,
        symbol=req.symbol,
        symbol_id=req.symbol_id,
        wallet_address=req.wallet_address,
        default_mode=req.default_mode,
    )
    return {"mandate": mandate}


@app.post("/automations")
async def create_automation(req: CreateAutomationRequest) -> dict:
    mandate = await compiler.compile(
        trade_id=req.trade_id,
        user_id=req.user_id,
        automation_id=req.automation_id,
        account_id=req.account_id,
        prompt=req.prompt,
        symbol=req.symbol,
        symbol_id=req.symbol_id,
        wallet_address=req.wallet_address,
        default_mode=req.default_mode,
    )
    await store.save_mandate(mandate)
    if req.initial_state:
        await store.save_state(req.initial_state)
    return {"mandate": mandate, "state": req.initial_state}


@app.get("/automations/{trade_id}")
async def get_automation(trade_id: str) -> dict:
    mandate = await store.load_mandate(trade_id)
    state = await store.load_state(trade_id)
    if not mandate:
        raise HTTPException(status_code=404, detail="mandate_not_found")
    return {"mandate": mandate, "state": state}


@app.put("/trades/{trade_id}/state")
async def update_state(trade_id: str, state: TradeState) -> dict:
    if state.trade_id != trade_id:
        raise HTTPException(status_code=400, detail="trade_id_mismatch")
    await store.save_state(state)
    return {"state": state}


@app.post("/trades/{trade_id}/evaluate")
async def evaluate_trade(trade_id: str, req: EvaluateRequest) -> dict:
    mandate = await store.load_mandate(trade_id)
    state = await store.load_state(trade_id)
    if not mandate:
        raise HTTPException(status_code=404, detail="mandate_not_found")
    if not state:
        raise HTTPException(status_code=404, detail="state_not_found")

    item = TradeDecisionInput(
        trade_id=trade_id,
        mandate=mandate,
        state=state,
        market_context=state.market_context,
        wallet_context={
            **state.wallet_context,
            "block_context": state.block_context,
        },
    )
    outcome = evaluate(item, market_data_age_ms=req.market_data_age_ms, now_ms=int(time.time() * 1000))
    if outcome.resolution == Resolution.HARD_STOP and outcome.action:
        actions = await _save_actions([outcome.action], mandate)
        return {"resolution": outcome.resolution.value, "actions": actions, "reason": outcome.reason}
    if outcome.resolution in (Resolution.NO_ACTION, Resolution.BLOCKED):
        return {"resolution": outcome.resolution.value, "actions": [], "reason": outcome.reason}

    if req.use_ai and ai_engine:
        decisions = await ai_engine.decide_batch([item], shared_market_context=state.market_context)
        actions = await _save_actions(decisions, mandate)
        return {"resolution": "AI_PROPOSED_ACTIONS", "actions": actions, "reason": outcome.reason}

    notify = ProposedAction(
        trade_id=trade_id,
        action="NOTIFY",
        action_params={"needs_ai": True},
        reason="Contextual rule requires AI review, but AI is not configured or disabled for this request.",
        confidence=1.0,
        health_score=state.health_score,
        source="DETERMINISTIC",
    )
    actions = await _save_actions([notify], mandate)
    return {"resolution": "NEEDS_AI_NOTIFIED", "actions": actions, "reason": outcome.reason}


@app.get("/trades/{trade_id}/actions")
async def list_actions(trade_id: str) -> dict:
    return {"actions": await store.proposed_actions(trade_id)}


@app.post("/actions/{action_id}/approval")
async def approve_action(action_id: str, req: ApproveRequest) -> dict:
    action = await store.load_proposed_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="action_not_found")
    action.status = "APPROVED" if req.approved else "REJECTED"
    await store.save_proposed_action(action)
    return {"action": action, "reviewerId": req.reviewer_id}
