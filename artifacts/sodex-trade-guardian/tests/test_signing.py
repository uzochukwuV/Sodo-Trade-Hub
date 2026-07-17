"""Verifies the signing primitives against the SoDEX docs' own worked
examples (trading-api.md "End-to-end signing example" and
"How to compute payloadHash"). These run fully offline -- no network calls,
no mocking of the crypto itself.
"""
from __future__ import annotations

from eth_account import Account

from sodex_guardian import wire
from sodex_guardian.enums import (
    OrderModifier,
    OrderSide,
    OrderType,
    PositionSide,
    TimeInForce,
)
from sodex_guardian.signing import (
    canonical_decimal_string,
    compact_json,
    payload_hash,
    sign_exchange_action,
)


def test_canonical_decimal_string_matches_docs_examples():
    # Table in the Schema page: "Decimal String" section.
    assert canonical_decimal_string("00123") == "123"
    assert canonical_decimal_string("+32.1") == "32.1"
    assert canonical_decimal_string("32.100") == "32.1"
    assert canonical_decimal_string("0.500") == "0.5"
    assert canonical_decimal_string("1.234e+2") == "123.4"
    assert canonical_decimal_string("001.230") == "1.23"
    assert canonical_decimal_string(0) == "0"
    assert canonical_decimal_string("0.001") == "0.001"


def test_compact_json_has_no_whitespace_and_preserves_order():
    payload = {"b": 1, "a": 2}  # insertion order must be preserved, not sorted
    out = compact_json(payload)
    assert out == '{"b":1,"a":2}'
    assert " " not in out


def test_market_buy_order_wire_matches_docs_example():
    # Docs' exact worked payload:
    # {"type":"newOrder","params":{"accountID":12345,"symbolID":1,"orders":[
    #   {"clOrdID":"my-order-1","modifier":1,"side":1,"type":2,"timeInForce":3,
    #    "quantity":"0.001","reduceOnly":false,"positionSide":1}]}}
    order = wire.perps_order_item(
        cl_ord_id="my-order-1",
        modifier=OrderModifier.NORMAL,
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        time_in_force=TimeInForce.IOC,
        reduce_only=False,
        position_side=PositionSide.BOTH,
        quantity="0.001",
    )
    params = wire.perps_new_order_params(account_id=12345, symbol_id=1, orders=[order])
    payload = {"type": "newOrder", "params": params}
    encoded = compact_json(payload)
    expected = (
        '{"type":"newOrder","params":{"accountID":12345,"symbolID":1,"orders":'
        '[{"clOrdID":"my-order-1","modifier":1,"side":1,"type":2,"timeInForce":3,'
        '"quantity":"0.001","reduceOnly":false,"positionSide":1}]}}'
    )
    assert encoded == expected


def test_omitempty_fields_are_actually_omitted():
    order = wire.perps_order_item(
        cl_ord_id="x",
        modifier=OrderModifier.NORMAL,
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        time_in_force=TimeInForce.GTC,
        reduce_only=False,
        price="100000",
        quantity="0.01",
        # funds, stopPrice, stopType, triggerType all omitted
    )
    assert "funds" not in order
    assert "stopPrice" not in order
    assert "stopType" not in order
    assert "triggerType" not in order


def test_exchange_action_signature_recovers_to_signer_address():
    acct = Account.create()
    order = wire.perps_order_item(
        cl_ord_id="test-order",
        modifier=OrderModifier.NORMAL,
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        time_in_force=TimeInForce.GTC,
        reduce_only=False,
        price="100000",
        quantity="0.001",
    )
    params = wire.perps_new_order_params(account_id=1, symbol_id=1, orders=[order])
    p_hash = payload_hash("newOrder", params)
    assert p_hash.startswith("0x") and len(p_hash) == 66

    result = sign_exchange_action(
        private_key=acct.key.hex(),
        action_type="newOrder",
        params=params,
        nonce=1760373925001,
        domain_name="futures",
        chain_id=286623,
    )
    assert result.signature.startswith("0x01")
    # 0x01 prefix (2 hex chars) + 65-byte signature (130 hex chars) + "0x" = 135
    assert len(result.signature) == 2 + 2 + 130

    # Recover the signer from the same typed-data structure and confirm it
    # matches the account that produced the signature.
    from eth_account.messages import encode_typed_data

    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "ExchangeAction": [
                {"name": "payloadHash", "type": "bytes32"},
                {"name": "nonce", "type": "uint64"},
            ],
        },
        "domain": {
            "name": "futures",
            "version": "1",
            "chainId": 286623,
            "verifyingContract": "0x0000000000000000000000000000000000000000",
        },
        "primaryType": "ExchangeAction",
        "message": {"payloadHash": p_hash, "nonce": 1760373925001},
    }
    signable = encode_typed_data(full_message=typed_data)
    raw_sig = bytes.fromhex(result.signature[4:])  # strip "0x" + the 0x01 prefix byte
    recovered_addr = Account.recover_message(signable, signature=raw_sig)
    assert recovered_addr == acct.address
