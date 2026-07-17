# SoDEX Testnet Signing And Transfer

- Testnet wallet derived from `PRIVATE_KEY`: `0x10c4712dB66B56782ACD2739673889A37c5DB604`.
- SoDEX account ID: `59798`.
- Approved API key name is `default`; use `X-API-Key: default`, not the wallet address.
- SoDEX gateway expects normalized ECDSA recovery id in typed signatures. If the signer returns `v=27/28`, convert to `0/1` before prefixing with `0x01`.
- Harmless signed perps `scheduleCancel` succeeded after using API key `default` and normalized `v`.
- Spot-to-perps transfer uses Spot REST base and Spot EIP-712 domain:
  - Endpoint: `POST /accounts/transfers` on `https://testnet-gw.sodex.dev/api/v1/spot`
  - Action type: `transferAsset`
  - Params order: `id`, `fromAccountID`, `toAccountID`, `coinID`, `amount`, `type`
  - `toAccountID=999`
  - `coinID=0` for vUSDC
  - `type=3` (`PERPS_WITHDRAW`)
- Executed transfer on 2026-07-17:
  - Amount: `100` vUSDC
  - Before: Spot `1000`, Perps available `0`
  - After: Spot `900`, Perps available `100`
