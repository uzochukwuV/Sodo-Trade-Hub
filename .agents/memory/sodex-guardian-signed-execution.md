# SoDEX Guardian Signed Execution Test

- Test date: 2026-07-17.
- Test wallet: `0x10c4712dB66B56782ACD2739673889A37c5DB604`.
- SoDEX account ID: `59798`.
- API key header must use key name `default`.
- ECDSA recovery id must be normalized from `27/28` to `0/1` before prefixing the SoDEX typed signature with `0x01`.

## Live Test Position

- Transferred `100` vUSDC from Spot to Perps first.
- Set BTC-USD leverage to `2x` cross.
- Opened BTC-USD market long:
  - Symbol ID: `1`
  - Quantity: `0.00018`
  - Entry: `62777`
  - Order ID: `2335106784`
  - Position ID: `2584937`

## AI Monitor Test

- Guardian trade ID: `sodex-2584937`.
- OpenRouter key works with plain chat completion.
- `tencent/hy3:free` is unreliable with LangChain/OpenRouter `withStructuredOutput`; use plain chat, JSON-only prompt, manual JSON extraction, Zod validation, timeout, and fail-closed `NOTIFY`.
- Confirmed AI monitor produced a valid `NOTIFY` action after this change.

## Signed Stop-Loss Execution

- First stop-market attempt used `timeInForce=GTC` and failed with `timeInForce is invalid`.
- Retried with `timeInForce=IOC` and succeeded.
- Successful reduce-only stop-loss:
  - Symbol: `BTC-USD`
  - Side: `SELL`
  - Quantity: `0.00018`
  - Stop price: `61835`
  - Trigger type: `MARK_PRICE`
  - Stop type: `STOP_LOSS`
  - Order ID: `2335323094`
  - Client order ID: `guardian-sl-1784275592257`

## Working Stop-Market Payload Shape

```json
{
  "modifier": 2,
  "side": 2,
  "type": 2,
  "timeInForce": 3,
  "quantity": "0.00018",
  "stopPrice": "61835",
  "stopType": 1,
  "triggerType": 2,
  "reduceOnly": true,
  "positionSide": 1
}
```

- `modifier=2` means stop order.
- `side=2` means sell for long-position stop-loss.
- `type=2` means market.
- `timeInForce=3` means IOC and is required for this stop-market shape.
- `stopType=1` means stop loss.
- `triggerType=2` means mark price.
