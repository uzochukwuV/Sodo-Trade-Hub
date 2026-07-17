"""Structured data models: the compiled TradeMandate (what an automation is
allowed to do), live trade state, and the AI batch decision schema.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Objective(str, Enum):
    PROTECT = "PROTECT"
    MAXIMIZE_PROFIT = "MAXIMIZE_PROFIT"
    FOLLOW_WALLET = "FOLLOW_WALLET"
    CUSTOM = "CUSTOM"


class ExecutionMode(str, Enum):
    ADVISORY = "ADVISORY"  # AI only suggests / notifies
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"  # AI prepares, user approves
    AUTOMATIC = "AUTOMATIC"  # AI may modify SL/TP
    FULLY_AUTOMATIC = "FULLY_AUTOMATIC"  # AI may close/partial-close


class AllowedAction(str, Enum):
    NOTIFY = "NOTIFY"
    MOVE_STOP = "MOVE_STOP"
    MODIFY_TAKE_PROFIT = "MODIFY_TAKE_PROFIT"
    PARTIAL_CLOSE = "PARTIAL_CLOSE"
    FULL_CLOSE = "FULL_CLOSE"
    ADD_TO_POSITION = "ADD_TO_POSITION"
    OPEN_HEDGE = "OPEN_HEDGE"


class ConditionKind(str, Enum):
    BREAKEVEN_ON_TRIGGER = "BREAKEVEN_ON_TRIGGER"
    VOLATILITY_ADAPTIVE_STOP = "VOLATILITY_ADAPTIVE_STOP"
    THESIS_INVALIDATION_EXIT = "THESIS_INVALIDATION_EXIT"
    CORRELATED_MARKET_STOP = "CORRELATED_MARKET_STOP"
    TIME_STOP = "TIME_STOP"
    MAX_DRAWDOWN_CIRCUIT_BREAKER = "MAX_DRAWDOWN_CIRCUIT_BREAKER"
    SCALE_OUT_LADDER = "SCALE_OUT_LADDER"
    MOMENTUM_AWARE_TAKE_PROFIT = "MOMENTUM_AWARE_TAKE_PROFIT"
    FUNDING_DRIVEN_EXIT = "FUNDING_DRIVEN_EXIT"
    ADD_ON_CONFIRMATION = "ADD_ON_CONFIRMATION"
    HEDGE_INSTEAD_OF_CLOSE = "HEDGE_INSTEAD_OF_CLOSE"
    AUTO_REDUCE_ON_LEVERAGE_CREEP = "AUTO_REDUCE_ON_LEVERAGE_CREEP"
    WALLET_MIRRORING = "WALLET_MIRRORING"
    CLUSTER_EXIT_RESPONSE = "CLUSTER_EXIT_RESPONSE"
    CONSENSUS_REQUIREMENT = "CONSENSUS_REQUIREMENT"
    EXPOSURE_CAPPING = "EXPOSURE_CAPPING"
    CORRELATION_NETTING = "CORRELATION_NETTING"
    HEALTH_ALERT = "HEALTH_ALERT"
    CUSTOM = "CUSTOM"


class MonitoringFlags(BaseModel):
    price: bool = True
    funding: bool = True
    open_interest: bool = True
    wallet_activity: bool = True
    block_clusters: bool = True
    volatility: bool = True
    correlated_markets: bool = False
    portfolio_exposure: bool = False


class MandateConstraints(BaseModel):
    """Hard limits enforced by the deterministic policy layer -- the AI
    cannot violate these no matter what it proposes (see rules.py /
    execution.py `validate_against_mandate`)."""

    max_leverage: float = 20.0
    max_loss_usd: Optional[float] = None
    max_loss_percent: Optional[float] = 100.0
    max_add_percent: float = 25.0
    max_hedge_percent: float = 50.0
    min_position_remaining_percent: float = 0.0
    max_actions_per_hour: int = 6
    cooldown_seconds: int = 60


class AutomationRule(BaseModel):
    """One user- or template-authored IF/THEN rule, compiled from natural
    language or a builder UI into a structured, replayable form."""

    rule_id: str
    kind: ConditionKind = ConditionKind.CUSTOM
    condition: str  # human-readable, kept for audit/explainability
    action: AllowedAction
    action_params: dict = Field(default_factory=dict)
    deterministic: bool = False
    requires_ai: bool = False
    priority: int = Field(default=50, ge=1, le=100)


class TradeMandate(BaseModel):
    """The compiled, versioned policy governing one open trade's
    automation. The user's free-text prompt is compiled into this ONCE;
    live evaluation always reads the structured mandate, never the raw
    prompt (see product notes: "The original prompt remains available for
    context, but execution is governed by the structured mandate.")."""

    trade_id: str
    user_id: str
    automation_id: str
    account_id: int
    wallet_address: Optional[str] = None
    symbol: Optional[str] = None
    symbol_id: Optional[int] = None

    objective: Objective = Objective.PROTECT
    mode: ExecutionMode = ExecutionMode.ADVISORY

    monitoring: MonitoringFlags = Field(default_factory=MonitoringFlags)
    allowed_actions: list[AllowedAction] = Field(
        default_factory=lambda: [AllowedAction.NOTIFY]
    )
    constraints: MandateConstraints = Field(default_factory=MandateConstraints)
    rules: list[AutomationRule] = Field(default_factory=list)

    user_instructions: str = ""
    policy_version: int = 1


class MonitoringPriority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TradeState(BaseModel):
    """Live, Redis-cached operational state for one monitored trade.
    PostgreSQL (or your durable store) remains the source of truth for the
    mandate itself; this is the fast-path cache the batch scheduler reads."""

    trade_id: str
    account_id: int
    symbol_id: int
    symbol: str
    position_side: int
    size: float
    entry_price: float
    mark_price: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    liquidation_price: Optional[float] = None
    unrealized_pnl: float = 0.0
    unrealized_pnl_percent: float = 0.0
    account_equity_usd: Optional[float] = None
    effective_leverage: Optional[float] = None
    funding_rate: Optional[float] = None
    open_interest_change_1h: Optional[float] = None
    realized_volatility_1h: Optional[float] = None
    held_since_ms: Optional[int] = None

    priority: MonitoringPriority = MonitoringPriority.NORMAL
    next_evaluation_at_ms: int = 0
    last_evaluation_at_ms: int = 0
    last_action_at_ms: int = 0
    actions_in_last_hour: int = 0
    health_score: int = 100
    market_context: dict = Field(default_factory=dict)
    wallet_context: dict = Field(default_factory=dict)
    block_context: dict = Field(default_factory=dict)


class TradeDecisionInput(BaseModel):
    """One item sent to the AI batch decision engine."""

    trade_id: str
    mandate: TradeMandate
    state: TradeState
    market_context: dict = Field(default_factory=dict)
    wallet_context: dict = Field(default_factory=dict)


class ProposedAction(BaseModel):
    """Structured output the AI (or the deterministic engine) must produce
    before anything touches the exchange. Every action needs a reason --
    see product notes on Explainability."""

    trade_id: str
    action_id: Optional[str] = None
    action: AllowedAction
    action_params: dict = Field(default_factory=dict)
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)
    health_score: int = Field(ge=0, le=100)
    source: str = "AI"  # "AI" | "DETERMINISTIC"
    requires_approval: bool = False
    status: str = "PROPOSED"  # PROPOSED | APPROVED | REJECTED | EXECUTED | FAILED
