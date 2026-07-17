# SoDEX Trade Guardian

A non-custodial, batched, agentic trade-management engine for SoDEX perps.
Built directly against the real SoDEX REST API and EIP-712 signing scheme --
**no mocks, no simulated exchange**. You provide real (or testnet) keys; this
talks to `mainnet-gw.sodex.dev` / `testnet-gw.sodex.dev` for real.

It implements the architecture from the design notes this project was built
from: sub-account isolation, scoped/revocable API keys, a Redis-backed
adaptive scheduler, a deterministic pre-filter, and a batched AI decision
layer ("AI Trade Guardian") that only reasons about the trades that actually
need contextual judgment.

## Why non-custodial

Your platform never holds user funds or the master wallet's private key in a
hot path (see `docs`: SoDEX sub-accounts + permissioned API keys):

```
User funds remain in SoDEX
        │
        ▼
User's master wallet signs `addAPIKey`  (one-time, offline-capable)
        │
        ▼
Platform registers a scoped, revocable API key per automation
        │
        ▼
Execution service signs trading requests with that key only
        │
        ▼
Orders execute directly on SoDEX, in the user's own (sub-)account
```

A permissioned key can be scoped to Trade + Cancel only, with Withdraw and
Transfer disabled (`accounts.Permission.automation_default()`), so even a
fully compromised execution service cannot move funds out.

## Architecture

```
Redis: evaluation-due (sorted set) ──▶ BatchCoordinator.run_cycle()
                                            │
                                    group trades by symbol
                                            │
                                fetch shared market snapshot ONCE per symbol
                                            │
                                 rules.evaluate() per trade  ── deterministic
                                    │              │
                              HARD_STOP      NEEDS_AI (batched, ≤ ai_batch_size)
                                    │              │
                                    │      AIBatchDecisionEngine (Anthropic,
                                    │        forced tool-use, structured JSON)
                                    │              │
                                    └──────┬───────┘
                                           ▼
                          execution.validate_against_mandate()  (policy check,
                                    cannot be bypassed by the AI)
                                           ▼
                          idempotency claim (Redis SETNX, dedupe window)
                                           ▼
                     ExecutionService._dispatch()  ── decrypts key HERE ONLY
                                           ▼
                        SodexPerpsClient (real EIP-712 signing, real HTTP)
                                           ▼
                                   SoDEX gateway
```

## Package layout

```
src/sodex_guardian/
  enums.py            OrderSide/Type/TimeInForce/... — exact integer values from the schema docs
  signing.py           EIP-712 signing (ExchangeAction, UserSignedAddAPIKeyAction, ...),
                        keccak256 payloadHash, canonical DecimalString formatting
  wire.py               Ordered param builders matching Go struct field order (required
                        for payloadHash to match the server's re-marshaled hash)
  nonce.py              Redis-atomic per-signing-address nonce allocation (Lua script)
  client.py             Async REST client: market data, account queries, signed trading
                        writes, master-wallet account management
  accounts.py            Sub-account resolution + scoped/permissioned API key provisioning
  models.py              TradeMandate, TradeState, ProposedAction (pydantic)
  redis_state.py          Trade state cache, adaptive scheduling, idempotency ledger
  rules.py                Deterministic pre-filter (most evaluations never reach the LLM)
  ai_engine.py             Batched Anthropic tool-use call -> structured ProposedAction[]
  execution.py             Policy validation + idempotent, mode-gated execution adapter
  batch_engine.py          Groups due trades by symbol, runs the funnel end-to-end
  scheduler.py             Main worker loop
  automation_repo.py        Redis + Fernet reference implementation of encrypted key storage

scripts/
  run_api.py            Run the standalone HTTP API for prompt compilation,
                        live trade-state updates, evaluation, and approvals
  setup_subaccount.py    Provision a scoped automation API key (real signed call)
  create_automation.py   Register a TradeMandate + TradeState for a trade
  run_worker.py          Run the scheduler loop

tests/
  test_signing.py        Verifies hashing/signing against the docs' own worked examples,
                        fully offline (no network, no mocking of the crypto)
```

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # fill in master wallet, Redis, Anthropic key, encryption key
redis-server &          # or point REDIS_URL at an existing instance
pytest                  # offline signing correctness tests
```

Generate an at-rest encryption key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## End-to-end example (testnet)

### 0. Run the standalone Guardian API

```bash
python scripts/run_api.py
```

The API listens on port `9100` and is intentionally separate from the main
analytics app. The first product surface should use `ADVISORY` or
`APPROVAL_REQUIRED` modes. Real signed execution should only be enabled after
SoDEX write endpoints, API-key permission bitmasks, and user approval flows
are verified.

Useful endpoints:

```text
GET  /health
POST /compile
POST /automations
GET  /automations/{trade_id}
PUT  /trades/{trade_id}/state
POST /trades/{trade_id}/evaluate
GET  /trades/{trade_id}/actions
POST /actions/{action_id}/approval
```

Example strategy prompt:

```json
{
  "user_id": "user-1",
  "account_id": 12345,
  "symbol": "BTC-USD",
  "symbol_id": 1,
  "default_mode": "APPROVAL_REQUIRED",
  "prompt": "Protect this BTC long. Move stop to breakeven once I am up 2%, scale out 25% at 5% and 25% at 10%, trail the rest using volatility, tighten my stop if block intelligence detects an exit cluster, and never risk more than 3% of account equity."
}
```

```bash
# 1. Provision a scoped, non-withdrawing API key for one automation
python scripts/setup_subaccount.py \
  --user-address 0xYourMasterWalletAddress \
  --sub-account-id 1 \
  --automation-id trend-following-1

# 2. Register the trade's mandate (compiled policy) + live state
python scripts/create_automation.py \
  --trade-id trade-001 --user-id user-1 --automation-id trend-following-1 \
  --account-id <accountID from step 1> \
  --symbol BTC-USD --symbol-id 1 \
  --size 0.05 --entry-price 100000 --mark-price 101200 \
  --stop-loss 97000 --mode ADVISORY

# 3. Run the worker
python scripts/run_worker.py
```

With `--mode ADVISORY`, the worker only ever notifies (stdout, or your
`NOTIFY_WEBHOOK_URL`). Move to `AUTOMATIC` (stop/TP management) or
`FULLY_AUTOMATIC` (partial/full close) only once you trust the pipeline for
that user/strategy -- `execution.validate_against_mandate()` enforces this
regardless of what the AI proposes.

## Consistency guarantees

- **Nonces**: one Redis-atomic counter per signing (EVM) address, fast-forwarded
  to wall-clock time on restart, never reused, never issued out of order to
  the same address (`nonce.py`). Each automation gets its own API key
  precisely so concurrent automations never share a nonce counter
  (`accounts.py`, per the docs' own recommendation).
- **Idempotency**: every proposed action is hashed into a dedupe key
  (`execution.idempotency_key`) and claimed via Redis `SETNX` before
  execution, so retries, duplicate scheduler cycles, or two workers racing
  on the same trade cannot double-fire an order.
- **Policy is not advisory**: `validate_against_mandate()` is the single
  choke point for every action regardless of whether it came from a
  deterministic rule or the AI. The AI cannot escalate its own authority.
- **Batch-level failures are distinguished from per-order failures**: SoDEX
  returns one duplicated error for pre-validation failures across an entire
  batch; `client._check_batch` detects this pattern and raises
  `SodexBatchError` instead of silently treating it as "order 0 failed."

## Honest gaps / things to verify before mainnet

- The exact REST route + HTTP method for `addAPIKey` / `revokeAPIKey` /
  `approveBuilderFee` was not present in the documentation pages this project
  could fetch (only the EIP-712 signing payload and the *query* counterpart,
  `GET .../accounts/{userAddress}/api-keys`, were documented). `client.py`
  assumes the obvious REST convention and exposes `AccountManagementPaths`
  to override it -- confirm against the OpenAPI/Postman collection linked
  from `https://sodex.com/documentation/llms.txt` or the
  [Go SDK](https://github.com/sodex-tech/sodex-go-sdk-public) before running
  against mainnet funds.
- The permissioned-API-key bitmask values (`accounts.Permission`) are this
  project's best-effort convention; the docs describe the capabilities
  (Trade / Cancel / Withdraw / Transfer) but not their bit positions.
  Confirm against the schema before relying on them to restrict a key.
- `automation_repo.py` is a minimal reference implementation, not a
  production key-management system -- swap in your own KMS/HSM-backed
  storage for real funds.
