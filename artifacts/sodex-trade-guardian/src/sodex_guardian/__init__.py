"""SoDEX Trade Guardian.

A non-custodial, batched, agentic trade-management engine for SoDEX perps:

- Real EIP-712 signing against the SoDEX REST API (no mocks).
- Sub-account + scoped API-key lifecycle management.
- Redis-backed trade state, adaptive scheduling, and idempotent execution.
- Deterministic pre-filtering + batched AI decisioning ("AI Trade Guardian").
"""

__version__ = "0.1.0"
