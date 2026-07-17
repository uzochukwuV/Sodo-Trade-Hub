"""Example: register a scoped, permissioned API key for one automation.

Usage:
    python scripts/setup_subaccount.py \\
        --user-address 0xYourMasterWalletAddress \\
        --sub-account-id 0 \\
        --automation-id trend-following-1

This performs REAL signed HTTP calls against SODEX_NETWORK (testnet by
default -- see .env). Nothing here is mocked: it needs a funded/registered
master wallet and a reachable SoDEX gateway.
"""
from __future__ import annotations

import argparse
import asyncio

from sodex_guardian.accounts import AccountManager, Permission
from sodex_guardian.client import SodexPerpsClient
from sodex_guardian.config import get_settings
from sodex_guardian.nonce import NonceManager
from redis.asyncio import Redis


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-address", required=True)
    parser.add_argument("--sub-account-id", type=int, default=None)
    parser.add_argument("--automation-id", required=True)
    args = parser.parse_args()

    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    nonces = NonceManager(redis)
    client = SodexPerpsClient(settings, nonces)
    manager = AccountManager(client)

    try:
        account_id = await manager.resolve_account_id(args.user_address, args.sub_account_id)
        print(f"Resolved accountID={account_id} for {args.user_address} "
              f"(sub-account {args.sub_account_id})")

        row, generated = await manager.provision_automation_key(
            user_id=args.user_address,
            account_id=account_id,
            automation_id=args.automation_id,
            permissions=Permission.automation_default(),
        )
        print("Provisioned automation API key:")
        print(f"  name        = {row.api_key_name}")
        print(f"  address     = {row.api_key_address}")
        print(f"  permissions = {row.permissions!r}")
        print(
            "  private_key =", generated.private_key,
            "  <-- encrypt this immediately and store only the ciphertext"
        )
    finally:
        await client.aclose()
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
