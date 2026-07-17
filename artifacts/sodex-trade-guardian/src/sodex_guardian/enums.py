"""Enums mirroring https://sodex.com/documentation/trading-api/rest-v1/schema

Integer values must match the docs exactly -- these are sent on the wire and
are also part of the EIP-712 signing payload, so a wrong value silently
produces a rejected (or worse, wrong) order.
"""
from __future__ import annotations

from enum import IntEnum


class OrderSide(IntEnum):
    BUY = 1
    SELL = 2


class OrderType(IntEnum):
    LIMIT = 1
    MARKET = 2


class TimeInForce(IntEnum):
    GTC = 1  # Good Til Canceled
    FOK = 2  # Fill or Kill (not supported yet per docs)
    IOC = 3  # Immediate Or Cancel
    GTX = 4  # Post Only


class TransferAssetType(IntEnum):
    EVM_DEPOSIT = 0
    PERPS_DEPOSIT = 1
    EVM_WITHDRAW = 2
    PERPS_WITHDRAW = 3
    INTERNAL = 4
    SPOT_WITHDRAW = 5
    SPOT_DEPOSIT = 6


class APIKeyType(IntEnum):
    EVM = 1


class OrderStatus(IntEnum):
    NEW = 1
    PARTIALLY_FILLED = 2
    FILLED = 3
    CANCELED = 4
    REJECTED = 5
    EXPIRED = 6
    TRIGGERED = 10  # perps only


class OrderModifier(IntEnum):
    """Perps only."""

    NORMAL = 1
    STOP = 2
    BRACKET = 3
    ATTACHED_STOP = 4


class MarginMode(IntEnum):
    """Perps only."""

    ISOLATED = 1
    CROSS = 2


class PositionSide(IntEnum):
    """Perps only. Only BOTH (oneway mode) is currently supported for order placement."""

    BOTH = 1
    LONG = 2
    SHORT = 3


class StopType(IntEnum):
    """Perps only."""

    STOP_LOSS = 1
    TAKE_PROFIT = 2


class TriggerType(IntEnum):
    """Perps only. Only MARK_PRICE is currently supported in order placement."""

    LAST_PRICE = 1
    MARK_PRICE = 2
    INDEX_PRICE = 3
