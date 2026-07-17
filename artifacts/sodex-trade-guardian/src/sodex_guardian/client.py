"""Async SoDEX Perps REST client.

Implements every endpoint documented at
https://sodex.com/documentation/trading-api/rest-v1/sodex-rest-perps-api

Reads (market data, account queries) are unauthenticated per the docs' own
curl examples. Writes (`trade/*`, `accounts/transfers`) are signed with a
registered API key and carry `X-API-Key` / `X-API-Sign` / `X-API-Nonce`.
Master-wallet-only account actions (`addAPIKey`, `revokeAPIKey`,
`approveBuilderFee`) carry `X-API-Chain` instead of `X-API-Key`.

NOTE on account-management endpoint paths: the fetched documentation pages
describe the EIP-712 signing payloads for `addAPIKey` / `addPermissionedAPIKey`
/ `revokeAPIKey` / `approveBuilderFee` in full, but do not show the literal
REST route + method for those calls (only the query counterpart
`GET .../accounts/{userAddress}/api-keys` is shown). This client follows the
obvious REST convention (`POST/DELETE .../accounts/api-keys`), matching the
collection resource the GET reads from. Verify this against the OpenAPI spec
/ Postman collection linked from https://sodex.com/documentation/llms.txt
before running against mainnet, and override via `AccountManagementPaths` if
it differs.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from . import wire
from .config import Settings
from .enums import (
    MarginMode,
    OrderModifier,
    OrderSide,
    OrderType,
    PositionSide,
    StopType,
    TimeInForce,
    TransferAssetType,
    TriggerType,
)
from .nonce import NonceManager
from .signing import (
    canonical_decimal_string,
    sign_add_api_key,
    sign_add_permissioned_api_key,
    sign_approve_builder_fee,
    sign_exchange_action,
)


class SodexAPIError(RuntimeError):
    def __init__(self, code: int, message: str, *, raw: Any = None) -> None:
        super().__init__(f"SoDEX API error {code}: {message}")
        self.code = code
        self.raw = raw


class SodexBatchError(RuntimeError):
    """Raised when a batched trade/order-cancel/replace call fails at the
    pre-validation stage (a single error is returned for the whole batch)."""

    def __init__(self, results: list[dict[str, Any]]) -> None:
        super().__init__(f"batch rejected: {results}")
        self.results = results


@dataclass
class AccountManagementPaths:
    """Overridable in case the real API differs from the REST convention
    assumed here -- see module docstring."""

    add_api_key: str = "/accounts/api-keys"
    revoke_api_key: str = "/accounts/api-keys"
    approve_builder_fee: str = "/accounts/builder-fee"


@dataclass
class SigningIdentity:
    """A single registered API key: the name presented in X-API-Key and the
    private key used to produce X-API-Sign. One identity should map to
    exactly one (sub)account and one concurrent trading process -- see
    nonce.py docstring."""

    api_key_name: str
    private_key: str
    domain_name: str = "futures"  # "futures" for perps, "spot" for spot


def _retryable(exc: BaseException) -> bool:
    return isinstance(exc, (httpx.TransportError, httpx.RemoteProtocolError))


class SodexPerpsClient:
    def __init__(
        self,
        settings: Settings,
        nonce_manager: NonceManager,
        *,
        http_client: Optional[httpx.AsyncClient] = None,
        account_paths: AccountManagementPaths | None = None,
    ) -> None:
        self._settings = settings
        self._nonces = nonce_manager
        self._base = settings.perps_endpoint.rstrip("/")
        self._http = http_client or httpx.AsyncClient(timeout=10.0)
        self._paths = account_paths or AccountManagementPaths()

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------ #
    # low-level request helpers
    # ------------------------------------------------------------------ #

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.2, max=2),
        retry=retry_if_exception_type((httpx.TransportError,)),
    )
    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._http.get(
            f"{self._base}{path}",
            params={k: v for k, v in (params or {}).items() if v is not None},
            headers={"Accept": "application/json"},
        )
        return self._unwrap(resp)

    async def _signed_write(
        self,
        method: str,
        path: str,
        *,
        identity: SigningIdentity,
        action_type: str,
        params: dict[str, Any],
    ) -> Any:
        signing_address = _address_for_identity(identity)
        nonce = await self._nonces.next_nonce(signing_address)
        sig = sign_exchange_action(
            private_key=identity.private_key,
            action_type=action_type,
            params=params,
            nonce=nonce,
            domain_name=identity.domain_name,
            chain_id=self._settings.domain_chain_id_for_trading,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Key": identity.api_key_name,
            "X-API-Sign": sig.signature,
            "X-API-Nonce": str(nonce),
        }
        resp = await self._http.request(
            method, f"{self._base}{path}", content=json.dumps(params), headers=headers
        )
        return self._unwrap(resp)

    async def _master_signed_write(
        self, method: str, path: str, *, headers: dict[str, str], body: dict[str, Any]
    ) -> Any:
        resp = await self._http.request(
            method, f"{self._base}{path}", content=json.dumps(body), headers=headers
        )
        return self._unwrap(resp)

    @staticmethod
    def _unwrap(resp: httpx.Response) -> Any:
        try:
            payload = resp.json()
        except ValueError as exc:
            resp.raise_for_status()
            raise SodexAPIError(-1, f"non-JSON response: {resp.text[:200]}") from exc
        code = payload.get("code", 0)
        if code != 0:
            raise SodexAPIError(code, payload.get("error", "unknown error"), raw=payload)
        return payload.get("data")

    # ------------------------------------------------------------------ #
    # market data (public, unauthenticated)
    # ------------------------------------------------------------------ #

    async def get_symbols(self, symbol: str | None = None) -> Any:
        return await self._get("/markets/symbols", {"symbol": symbol})

    async def get_coins(self, coin: str | None = None) -> Any:
        return await self._get("/markets/coins", {"coin": coin})

    async def get_tickers(self, symbol: str | None = None) -> Any:
        return await self._get("/markets/tickers", {"symbol": symbol})

    async def get_mini_tickers(self, symbol: str | None = None) -> Any:
        return await self._get("/markets/miniTickers", {"symbol": symbol})

    async def get_mark_prices(self, symbol: str | None = None) -> Any:
        return await self._get("/markets/mark-prices", {"symbol": symbol})

    async def get_book_tickers(self, symbol: str | None = None) -> Any:
        return await self._get("/markets/bookTickers", {"symbol": symbol})

    async def get_orderbook(self, symbol: str, limit: int = 10) -> Any:
        return await self._get(f"/markets/{symbol}/orderbook", {"limit": limit})

    async def get_klines(
        self,
        symbol: str,
        interval: str,
        *,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int | None = None,
    ) -> Any:
        return await self._get(
            f"/markets/{symbol}/klines",
            {
                "interval": interval,
                "startTime": start_time,
                "endTime": end_time,
                "limit": limit,
            },
        )

    async def get_recent_trades(self, symbol: str, limit: int | None = None) -> Any:
        return await self._get(f"/markets/{symbol}/trades", {"limit": limit})

    # ------------------------------------------------------------------ #
    # account queries (public by address, unauthenticated)
    # ------------------------------------------------------------------ #

    async def get_balances(self, user_address: str, account_id: int | None = None) -> Any:
        return await self._get(
            f"/accounts/{user_address}/balances", {"accountID": account_id}
        )

    async def get_open_orders(
        self, user_address: str, account_id: int | None = None, symbol: str | None = None
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/orders",
            {"symbol": symbol, "accountID": account_id},
        )

    async def get_open_positions(self, user_address: str, account_id: int | None = None) -> Any:
        return await self._get(
            f"/accounts/{user_address}/positions", {"accountID": account_id}
        )

    async def get_state(self, user_address: str, account_id: int | None = None) -> Any:
        """Comprehensive account state, including `aid` == account ID -- see
        docs "Get account ID"."""
        return await self._get(f"/accounts/{user_address}/state", {"accountID": account_id})

    async def get_account_id(self, user_address: str, account_id: int | None = None) -> int:
        state = await self.get_state(user_address, account_id)
        return int(state["aid"])

    async def get_api_keys(
        self, user_address: str, account_id: int | None = None, name: str | None = None
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/api-keys",
            {"accountID": account_id, "name": name},
        )

    async def get_fee_rate(
        self, user_address: str, account_id: int | None = None, symbol: str | None = None
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/fee-rate",
            {"accountID": account_id, "symbol": symbol},
        )

    async def get_order_history(
        self,
        user_address: str,
        *,
        account_id: int | None = None,
        symbol: str | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int | None = None,
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/orders/history",
            {
                "accountID": account_id,
                "symbol": symbol,
                "startTime": start_time,
                "endTime": end_time,
                "limit": limit,
            },
        )

    async def get_position_history(
        self,
        user_address: str,
        *,
        account_id: int | None = None,
        symbol: str | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int | None = None,
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/positions/history",
            {
                "accountID": account_id,
                "symbol": symbol,
                "startTime": start_time,
                "endTime": end_time,
                "limit": limit,
            },
        )

    async def get_trades(
        self,
        user_address: str,
        *,
        account_id: int | None = None,
        symbol: str | None = None,
        order_id: int | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int | None = None,
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/trades",
            {
                "accountID": account_id,
                "symbol": symbol,
                "orderID": order_id,
                "startTime": start_time,
                "endTime": end_time,
                "limit": limit,
            },
        )

    async def get_fundings(
        self,
        user_address: str,
        *,
        account_id: int | None = None,
        symbol: str | None = None,
        position_id: int | None = None,
        start_time: int | None = None,
        end_time: int | None = None,
        limit: int | None = None,
    ) -> Any:
        return await self._get(
            f"/accounts/{user_address}/fundings",
            {
                "accountID": account_id,
                "symbol": symbol,
                "positionID": position_id,
                "startTime": start_time,
                "endTime": end_time,
                "limit": limit,
            },
        )

    # ------------------------------------------------------------------ #
    # trading (signed writes, API-key identity)
    # ------------------------------------------------------------------ #

    async def place_orders(
        self, *, identity: SigningIdentity, account_id: int, symbol_id: int, orders: list[dict]
    ) -> list[dict]:
        """POST /trade/orders -- place 1..100 orders atomically in one signed
        payload (bracket TP/SL, standalone TP/SL, or plain orders)."""
        if not orders:
            raise ValueError("orders batch cannot be empty")
        if len(orders) > self._settings.max_orders_per_batch_request:
            raise ValueError(
                f"batch of {len(orders)} exceeds max {self._settings.max_orders_per_batch_request}"
            )
        params = wire.perps_new_order_params(
            account_id=account_id, symbol_id=symbol_id, orders=orders
        )
        result = await self._signed_write(
            "POST", "/trade/orders", identity=identity, action_type="newOrder", params=params
        )
        return _check_batch(result)

    async def cancel_orders(
        self, *, identity: SigningIdentity, account_id: int, cancels: list[dict]
    ) -> list[dict]:
        if not cancels:
            raise ValueError("cancels batch cannot be empty")
        params = wire.perps_cancel_params(account_id=account_id, cancels=cancels)
        result = await self._signed_write(
            "DELETE", "/trade/orders", identity=identity, action_type="cancelOrder", params=params
        )
        return _check_batch(result)

    async def replace_orders(
        self, *, identity: SigningIdentity, account_id: int, orders: list[dict]
    ) -> list[dict]:
        if not orders:
            raise ValueError("orders batch cannot be empty")
        params = wire.replace_order_params(account_id=account_id, orders=orders)
        result = await self._signed_write(
            "POST",
            "/trade/orders/replace",
            identity=identity,
            action_type="replaceOrder",
            params=params,
        )
        return _check_batch(result)

    async def modify_tp_sl_order(
        self,
        *,
        identity: SigningIdentity,
        account_id: int,
        symbol_id: int,
        order_id: int | None = None,
        cl_ord_id: str | None = None,
        price: float | str | None = None,
        quantity: float | str | None = None,
        stop_price: float | str | None = None,
    ) -> None:
        params = wire.modify_order_params(
            account_id=account_id,
            symbol_id=symbol_id,
            order_id=order_id,
            cl_ord_id=cl_ord_id,
            price=price,
            quantity=quantity,
            stop_price=stop_price,
        )
        await self._signed_write(
            "POST",
            "/trade/orders/modify",
            identity=identity,
            action_type="modifyOrder",
            params=params,
        )

    async def schedule_cancel(
        self, *, identity: SigningIdentity, account_id: int, scheduled_timestamp: int | None
    ) -> None:
        params = wire.schedule_cancel_params(
            account_id=account_id, scheduled_timestamp=scheduled_timestamp
        )
        await self._signed_write(
            "POST",
            "/trade/orders/schedule-cancel",
            identity=identity,
            action_type="scheduleCancel",
            params=params,
        )

    async def update_leverage(
        self,
        *,
        identity: SigningIdentity,
        account_id: int,
        symbol_id: int,
        leverage: int,
        margin_mode: MarginMode,
    ) -> None:
        params = wire.update_leverage_params(
            account_id=account_id,
            symbol_id=symbol_id,
            leverage=leverage,
            margin_mode=int(margin_mode),
        )
        await self._signed_write(
            "POST",
            "/trade/leverage",
            identity=identity,
            action_type="updateLeverage",
            params=params,
        )

    async def update_isolated_margin(
        self, *, identity: SigningIdentity, account_id: int, symbol_id: int, amount: float | str
    ) -> None:
        params = wire.update_margin_params(
            account_id=account_id, symbol_id=symbol_id, amount=amount
        )
        await self._signed_write(
            "POST", "/trade/margin", identity=identity, action_type="updateMargin", params=params
        )

    async def transfer_asset(
        self,
        *,
        identity: SigningIdentity,
        transfer_id: int,
        from_account_id: int,
        to_account_id: int,
        coin_id: int,
        amount: float | str,
        transfer_type: TransferAssetType,
    ) -> dict:
        params = wire.transfer_asset_params(
            transfer_id=transfer_id,
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            coin_id=coin_id,
            amount=amount,
            transfer_type=int(transfer_type),
        )
        return await self._signed_write(
            "POST",
            "/accounts/transfers",
            identity=identity,
            action_type="transferAsset",
            params=params,
        )

    # ------------------------------------------------------------------ #
    # account management (master wallet only)
    # ------------------------------------------------------------------ #

    async def add_api_key(
        self,
        *,
        account_id: int,
        name: str,
        public_key: str,
        expires_at: int = 0,
        key_type: int = 1,
    ) -> Any:
        """Registers a new signing key for `account_id` (master or
        sub-account). Must be signed by the MASTER wallet."""
        nonce = await self._nonces.next_nonce(self._settings.sodex_master_wallet_address)
        sig = sign_add_api_key(
            master_private_key=self._settings.sodex_master_wallet_private_key,
            api_chain=self._settings.sodex_api_chain,
            message_chain_id=self._settings.message_chain_id,
            nonce=nonce,
            account_id=account_id,
            name=name,
            key_type=key_type,
            public_key=public_key,
            expires_at=expires_at,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Chain": str(self._settings.sodex_api_chain),
            "X-API-Sign": sig,
            "X-API-Nonce": str(nonce),
        }
        body = {
            "accountID": account_id,
            "name": name,
            "type": key_type,  # request payload field is "type"; typed data uses "keyType"
            "publicKey": public_key,
            "expiresAt": expires_at,
        }
        return await self._master_signed_write(
            "POST", self._paths.add_api_key, headers=headers, body=body
        )

    async def add_permissioned_api_key(
        self,
        *,
        account_id: int,
        name: str,
        public_key: str,
        permissions: int,
        expires_at: int = 0,
        key_type: int = 1,
    ) -> Any:
        nonce = await self._nonces.next_nonce(self._settings.sodex_master_wallet_address)
        sig = sign_add_permissioned_api_key(
            master_private_key=self._settings.sodex_master_wallet_private_key,
            api_chain=self._settings.sodex_api_chain,
            message_chain_id=self._settings.message_chain_id,
            nonce=nonce,
            account_id=account_id,
            name=name,
            key_type=key_type,
            public_key=public_key,
            expires_at=expires_at,
            permissions=permissions,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Chain": str(self._settings.sodex_api_chain),
            "X-API-Sign": sig,
            "X-API-Nonce": str(nonce),
        }
        body = {
            "accountID": account_id,
            "name": name,
            "type": key_type,
            "publicKey": public_key,
            "expiresAt": expires_at,
            "permissions": permissions,
        }
        return await self._master_signed_write(
            "POST", self._paths.add_api_key, headers=headers, body=body
        )

    async def revoke_api_key(self, *, account_id: int, name: str) -> Any:
        """revokeAPIKey goes through the ExchangeAction envelope (per docs'
        `type` enumeration) but MUST be signed with the master wallet's
        private key, not an API key's."""
        params = {"accountID": account_id, "name": name}
        nonce = await self._nonces.next_nonce(self._settings.sodex_master_wallet_address)
        sig = sign_exchange_action(
            private_key=self._settings.sodex_master_wallet_private_key,
            action_type="revokeAPIKey",
            params=params,
            nonce=nonce,
            domain_name="futures",
            chain_id=self._settings.domain_chain_id_for_trading,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Sign": sig.signature,
            "X-API-Nonce": str(nonce),
        }
        return await self._master_signed_write(
            "DELETE", self._paths.revoke_api_key, headers=headers, body=params
        )

    async def approve_builder_fee(self, *, account_id: int, builder_id: int, max_fee_rate: int) -> Any:
        nonce = await self._nonces.next_nonce(self._settings.sodex_master_wallet_address)
        sig = sign_approve_builder_fee(
            master_private_key=self._settings.sodex_master_wallet_private_key,
            api_chain=self._settings.sodex_api_chain,
            message_chain_id=self._settings.message_chain_id,
            nonce=nonce,
            account_id=account_id,
            builder_id=builder_id,
            max_fee_rate=max_fee_rate,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Chain": str(self._settings.sodex_api_chain),
            "X-API-Sign": sig,
            "X-API-Nonce": str(nonce),
        }
        body = {"accountID": account_id, "builderID": builder_id, "maxFeeRate": max_fee_rate}
        return await self._master_signed_write(
            "POST", self._paths.approve_builder_fee, headers=headers, body=body
        )


def _address_for_identity(identity: SigningIdentity) -> str:
    """Nonces are tracked by signing address (EVM address), not by key name.
    We derive the address from the private key to keep the nonce keyspace
    correct even if the caller only configured the private key."""
    from eth_account import Account

    return Account.from_key(identity.private_key).address


def _check_batch(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Docs: pre-validation failures return a single duplicated error entry
    for the whole batch. Surface that distinctly from per-order failures so
    callers can retry the whole batch instead of only the failed orders."""
    if len(results) >= 2 and all(
        r.get("code") == results[0].get("code")
        and r.get("error") == results[0].get("error")
        and r.get("code") != 0
        for r in results
    ):
        raise SodexBatchError(results)
    return results
