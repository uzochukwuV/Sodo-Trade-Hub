"""EIP-712 signing for SoDEX, implemented directly against the rules published at
https://sodex.com/documentation/trading-api/trading-api#api-keys-and-nonces

Two signature families exist:

1. "Universal" actions (`addAPIKey`, `addPermissionedAPIKey`, `approveBuilderFee`) --
   always signed by the MASTER WALLET, domain.name == "universal",
   domain.chainId == X-API-Chain (an arbitrary, deployment-fixed uint64),
   typed-signature prefix byte 0x02.

2. "Exchange" actions (`newOrder`, `cancelOrder`, `replaceOrder`, `modifyOrder`,
   `updateLeverage`, `updateMargin`, `updateCollateral`, `transferAsset`,
   `scheduleCancel`, `revokeAPIKey`, ...) -- signed with a registered API key's
   private key (EXCEPT `revokeAPIKey`, which must use the master wallet's key),
   domain.name == "spot" or "futures", domain.chainId == 286623 (mainnet) or
   138565 (testnet), typed-signature prefix byte 0x01.

   These are signed indirectly: the caller first serializes {"type", "params"}
   as compact JSON (exact field order matching the Go structs -- see
   `wire.py`), hashes it with keccak256 to get `payloadHash`, then EIP-712
   signs the tiny `ExchangeAction{payloadHash, nonce}` struct.

No mocking: this module performs real secp256k1 signing via eth_account and
real keccak256 hashing via eth_utils. Bring your own private keys.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

_EIP712_DOMAIN_TYPE = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]


def compact_json(obj: Any) -> str:
    """Serialize with no whitespace and WITHOUT reordering keys.

    Python dicts preserve insertion order (guaranteed since 3.7), so callers
    must build `params` dicts with keys already in Go-struct-definition
    order (see wire.py). json.dumps here must never be given sort_keys=True.
    """
    return json.dumps(obj, separators=(",", ":"), sort_keys=False)


def payload_hash(action_type: str, params: Mapping[str, Any]) -> str:
    """payloadHash = Keccak256(compact_json({"type": ..., "params": ...}))."""
    payload = {"type": action_type, "params": params}
    digest = keccak(text=compact_json(payload))
    return "0x" + digest.hex()


def _sign_typed(private_key: str, typed_data: dict) -> bytes:
    signable = encode_typed_data(full_message=typed_data)
    signed = Account.sign_message(signable, private_key=private_key)
    sig = bytes(signed.signature)
    if len(sig) != 65:
        raise ValueError(f"expected 65-byte signature, got {len(sig)} bytes")
    return sig


def _hex(b: bytes) -> str:
    return "0x" + b.hex()


@dataclass(frozen=True)
class ExchangeSignature:
    signature: str  # 0x01-prefixed typed signature
    nonce: int
    payload_hash: str


def sign_exchange_action(
    *,
    private_key: str,
    action_type: str,
    params: Mapping[str, Any],
    nonce: int,
    domain_name: str,  # "spot" | "futures"
    chain_id: int,  # 286623 mainnet / 138565 testnet
) -> ExchangeSignature:
    """Sign a trading/account-mutation action that goes through the generic
    ExchangeAction{payloadHash, nonce} envelope. Used for newOrder,
    cancelOrder, replaceOrder, modifyOrder, updateLeverage, updateMargin,
    updateCollateral, transferAsset, scheduleCancel, and (with the MASTER
    wallet's key) revokeAPIKey.
    """
    p_hash = payload_hash(action_type, params)
    typed_data = {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "ExchangeAction": [
                {"name": "payloadHash", "type": "bytes32"},
                {"name": "nonce", "type": "uint64"},
            ],
        },
        "domain": {
            "name": domain_name,
            "version": "1",
            "chainId": chain_id,
            "verifyingContract": ZERO_ADDRESS,
        },
        "primaryType": "ExchangeAction",
        "message": {
            "payloadHash": p_hash,
            "nonce": nonce,
        },
    }
    sig = _sign_typed(private_key, typed_data)
    return ExchangeSignature(signature="0x01" + sig.hex(), nonce=nonce, payload_hash=p_hash)


def sign_add_api_key(
    *,
    master_private_key: str,
    api_chain: int,
    message_chain_id: int,
    nonce: int,
    account_id: int,
    name: str,
    key_type: int,
    public_key: str,
    expires_at: int,
) -> str:
    """Sign UserSignedAddAPIKeyAction with the master wallet. Returns the
    0x02-prefixed typed signature."""
    typed_data = {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "UserSignedAddAPIKeyAction": [
                {"name": "chainID", "type": "uint64"},
                {"name": "nonce", "type": "uint64"},
                {"name": "accountID", "type": "uint64"},
                {"name": "name", "type": "string"},
                {"name": "keyType", "type": "uint8"},
                {"name": "publicKey", "type": "bytes"},
                {"name": "expiresAt", "type": "uint64"},
            ],
        },
        "domain": {
            "name": "universal",
            "version": "1",
            "chainId": api_chain,
            "verifyingContract": ZERO_ADDRESS,
        },
        "primaryType": "UserSignedAddAPIKeyAction",
        "message": {
            "chainID": message_chain_id,
            "nonce": nonce,
            "accountID": account_id,
            "name": name,
            "keyType": key_type,
            "publicKey": public_key,
            "expiresAt": expires_at,
        },
    }
    sig = _sign_typed(master_private_key, typed_data)
    return "0x02" + sig.hex()


def sign_add_permissioned_api_key(
    *,
    master_private_key: str,
    api_chain: int,
    message_chain_id: int,
    nonce: int,
    account_id: int,
    name: str,
    key_type: int,
    public_key: str,
    expires_at: int,
    permissions: int,
) -> str:
    """Sign UserSignedAddPermissionedAPIKeyAction with the master wallet.
    `permissions` is a bitmask (see accounts.Permission)."""
    typed_data = {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "UserSignedAddPermissionedAPIKeyAction": [
                {"name": "chainID", "type": "uint64"},
                {"name": "nonce", "type": "uint64"},
                {"name": "accountID", "type": "uint64"},
                {"name": "name", "type": "string"},
                {"name": "keyType", "type": "uint8"},
                {"name": "publicKey", "type": "bytes"},
                {"name": "expiresAt", "type": "uint64"},
                {"name": "permissions", "type": "uint64"},
            ],
        },
        "domain": {
            "name": "universal",
            "version": "1",
            "chainId": api_chain,
            "verifyingContract": ZERO_ADDRESS,
        },
        "primaryType": "UserSignedAddPermissionedAPIKeyAction",
        "message": {
            "chainID": message_chain_id,
            "nonce": nonce,
            "accountID": account_id,
            "name": name,
            "keyType": key_type,
            "publicKey": public_key,
            "expiresAt": expires_at,
            "permissions": permissions,
        },
    }
    sig = _sign_typed(master_private_key, typed_data)
    return "0x02" + sig.hex()


def sign_add_api_key_with_builder(
    *,
    master_private_key: str,
    api_chain: int,
    message_chain_id: int,
    nonce: int,
    account_id: int,
    name: str,
    key_type: int,
    public_key: str,
    expires_at: int,
    builder_id: int,
    max_fee_rate: int,
) -> str:
    typed_data = {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "AddAPIKeyWithBuilder": [
                {"name": "chainID", "type": "uint64"},
                {"name": "nonce", "type": "uint64"},
                {"name": "accountID", "type": "uint64"},
                {"name": "name", "type": "string"},
                {"name": "keyType", "type": "uint8"},
                {"name": "publicKey", "type": "bytes"},
                {"name": "expiresAt", "type": "uint64"},
                {"name": "builderID", "type": "uint64"},
                {"name": "maxFeeRate", "type": "uint64"},
            ],
        },
        "domain": {
            "name": "universal",
            "version": "1",
            "chainId": api_chain,
            "verifyingContract": ZERO_ADDRESS,
        },
        "primaryType": "AddAPIKeyWithBuilder",
        "message": {
            "chainID": message_chain_id,
            "nonce": nonce,
            "accountID": account_id,
            "name": name,
            "keyType": key_type,
            "publicKey": public_key,
            "expiresAt": expires_at,
            "builderID": builder_id,
            "maxFeeRate": max_fee_rate,
        },
    }
    sig = _sign_typed(master_private_key, typed_data)
    return "0x02" + sig.hex()


def sign_approve_builder_fee(
    *,
    master_private_key: str,
    api_chain: int,
    message_chain_id: int,
    nonce: int,
    account_id: int,
    builder_id: int,
    max_fee_rate: int,
) -> str:
    if not (0 <= max_fee_rate <= 2000):
        raise ValueError("maxFeeRate must be between 0 and 2000 inclusive")
    typed_data = {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "ApproveBuilderFeeAction": [
                {"name": "chainID", "type": "uint64"},
                {"name": "nonce", "type": "uint64"},
                {"name": "accountID", "type": "uint64"},
                {"name": "builderID", "type": "uint64"},
                {"name": "maxFeeRate", "type": "uint64"},
            ],
        },
        "domain": {
            "name": "universal",
            "version": "1",
            "chainId": api_chain,
            "verifyingContract": ZERO_ADDRESS,
        },
        "primaryType": "ApproveBuilderFeeAction",
        "message": {
            "chainID": message_chain_id,
            "nonce": nonce,
            "accountID": account_id,
            "builderID": builder_id,
            "maxFeeRate": max_fee_rate,
        },
    }
    sig = _sign_typed(master_private_key, typed_data)
    return "0x02" + sig.hex()


def canonical_decimal_string(value: "str | int | float") -> str:
    """Render a number as the canonical DecimalString the docs describe:
    no leading '+', no exponential notation, no leading zeros in the integer
    part (except a bare '0'), no trailing zeros in the fractional part.
    """
    from decimal import Decimal

    d = Decimal(str(value))
    negative = d < 0
    d = abs(d)
    s = format(d, "f")  # fixed-point, never exponential, for Decimal
    if "." in s:
        int_part, frac_part = s.split(".")
    else:
        int_part, frac_part = s, ""
    int_part = int_part.lstrip("0") or "0"
    frac_part = frac_part.rstrip("0")
    out = int_part + (f".{frac_part}" if frac_part else "")
    if negative and out != "0":
        out = "-" + out
    return out
