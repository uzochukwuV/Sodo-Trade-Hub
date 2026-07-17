"""Builds the exact ordered `params` dicts required for payloadHash computation.

Per the docs: "the server verifies signatures by parsing the request body
into Go structs and re-marshaling via json.Marshal, which serializes fields
in struct definition order." Field order here MUST match
https://sodex.com/documentation/trading-api/trading-api#how-to-compute-payloadhash
and the schema page. `omitempty` fields are left out of the dict entirely
when None -- never emitted as null.

These same ordered dicts are also perfectly valid HTTP request bodies (the
order doesn't matter for the wire body itself, only for hashing), so callers
can send them as-is via httpx's `json=`.
"""
from __future__ import annotations

from typing import Any, Optional

from .enums import (
    OrderModifier,
    OrderSide,
    OrderType,
    PositionSide,
    StopType,
    TimeInForce,
    TriggerType,
)
from .signing import canonical_decimal_string as dec


def _omit_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def perps_order_item(
    *,
    cl_ord_id: str,
    modifier: OrderModifier,
    side: OrderSide,
    order_type: OrderType,
    time_in_force: TimeInForce,
    reduce_only: bool,
    position_side: PositionSide = PositionSide.BOTH,
    price: Optional[str | float] = None,
    quantity: Optional[str | float] = None,
    funds: Optional[str | float] = None,
    stop_price: Optional[str | float] = None,
    stop_type: Optional[StopType] = None,
    trigger_type: Optional[TriggerType] = None,
) -> dict[str, Any]:
    """Field order per docs: clOrdID, modifier, side, type, timeInForce,
    price, quantity, funds, stopPrice, stopType, triggerType, reduceOnly,
    positionSide."""
    item: dict[str, Any] = {
        "clOrdID": cl_ord_id,
        "modifier": int(modifier),
        "side": int(side),
        "type": int(order_type),
        "timeInForce": int(time_in_force),
    }
    if price is not None:
        item["price"] = dec(price)
    if quantity is not None:
        item["quantity"] = dec(quantity)
    if funds is not None:
        item["funds"] = dec(funds)
    if stop_price is not None:
        item["stopPrice"] = dec(stop_price)
    if stop_type is not None:
        item["stopType"] = int(stop_type)
    if trigger_type is not None:
        item["triggerType"] = int(trigger_type)
    item["reduceOnly"] = bool(reduce_only)
    item["positionSide"] = int(position_side)
    return item


def perps_new_order_params(
    *, account_id: int, symbol_id: int, orders: list[dict[str, Any]]
) -> dict[str, Any]:
    return {"accountID": account_id, "symbolID": symbol_id, "orders": orders}


def perps_cancel_item(
    *, symbol_id: int, order_id: Optional[int] = None, cl_ord_id: Optional[str] = None
) -> dict[str, Any]:
    item: dict[str, Any] = {"symbolID": symbol_id}
    if order_id is not None:
        item["orderID"] = order_id
    if cl_ord_id is not None:
        item["clOrdID"] = cl_ord_id
    return item


def perps_cancel_params(*, account_id: int, cancels: list[dict[str, Any]]) -> dict[str, Any]:
    return {"accountID": account_id, "cancels": cancels}


def replace_params(
    *,
    symbol_id: int,
    cl_ord_id: str,
    orig_order_id: Optional[int] = None,
    orig_cl_ord_id: Optional[str] = None,
    price: Optional[str | float] = None,
    quantity: Optional[str | float] = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {"symbolID": symbol_id, "clOrdID": cl_ord_id}
    if orig_order_id is not None:
        item["origOrderID"] = orig_order_id
    if orig_cl_ord_id is not None:
        item["origClOrdID"] = orig_cl_ord_id
    if price is not None:
        item["price"] = dec(price)
    if quantity is not None:
        item["quantity"] = dec(quantity)
    return item


def replace_order_params(*, account_id: int, orders: list[dict[str, Any]]) -> dict[str, Any]:
    return {"accountID": account_id, "orders": orders}


def modify_order_params(
    *,
    account_id: int,
    symbol_id: int,
    order_id: Optional[int] = None,
    cl_ord_id: Optional[str] = None,
    price: Optional[str | float] = None,
    quantity: Optional[str | float] = None,
    stop_price: Optional[str | float] = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {"accountID": account_id, "symbolID": symbol_id}
    if order_id is not None:
        item["orderID"] = order_id
    if cl_ord_id is not None:
        item["clOrdID"] = cl_ord_id
    if price is not None:
        item["price"] = dec(price)
    if quantity is not None:
        item["quantity"] = dec(quantity)
    if stop_price is not None:
        item["stopPrice"] = dec(stop_price)
    return item


def update_leverage_params(
    *, account_id: int, symbol_id: int, leverage: int, margin_mode: int
) -> dict[str, Any]:
    return {
        "accountID": account_id,
        "symbolID": symbol_id,
        "leverage": leverage,
        "marginMode": margin_mode,
    }


def update_margin_params(
    *, account_id: int, symbol_id: int, amount: str | float
) -> dict[str, Any]:
    return {"accountID": account_id, "symbolID": symbol_id, "amount": dec(amount)}


def update_collateral_params(
    *, account_id: int, coin_id: int, amount: str | float
) -> dict[str, Any]:
    return {"accountID": account_id, "coinID": coin_id, "amount": dec(amount)}


def transfer_asset_params(
    *,
    transfer_id: int,
    from_account_id: int,
    to_account_id: int,
    coin_id: int,
    amount: str | float,
    transfer_type: int,
) -> dict[str, Any]:
    return {
        "id": transfer_id,
        "fromAccountID": from_account_id,
        "toAccountID": to_account_id,
        "coinID": coin_id,
        "amount": dec(amount),
        "type": transfer_type,
    }


def schedule_cancel_params(
    *, account_id: int, scheduled_timestamp: Optional[int] = None
) -> dict[str, Any]:
    item: dict[str, Any] = {"accountID": account_id}
    if scheduled_timestamp is not None:
        item["scheduledTimestamp"] = scheduled_timestamp
    return item
