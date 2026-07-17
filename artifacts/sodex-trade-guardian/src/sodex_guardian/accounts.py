"""Sub-account + scoped API-key lifecycle, the non-custodial foundation for
every automation.

Model (from the SoDEX docs & the product notes this project implements):

    Master Wallet
    ├── Main Account         (accountID = primary)
    ├── Sub-account #1       AI Trend Following
    ├── Sub-account #2       Copy Trading
    ├── Sub-account #3       High Risk
    └── Sub-account #4       Testing

Each automation gets its OWN sub-account and its OWN API key (never shared),
because nonces are tracked per signing address (see nonce.py) -- sharing a
key across concurrent strategies causes nonce races.

The platform never holds the master wallet's private key in a hot path: it
is only used for `addAPIKey` / `revokeAPIKey` / `approveBuilderFee`, and
should live in an offline signer or HSM in production. Day-to-day trading
uses a generated, revocable API key whose private key is encrypted at rest
and only decrypted inside the execution service (see execution.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntFlag
from typing import Optional

from eth_account import Account

from .client import SodexPerpsClient, SigningIdentity


class Permission(IntFlag):
    """Permission bitmask for `addPermissionedAPIKey`.

    The docs describe permissioned keys that can disable Trading, Canceling
    orders, Withdrawals, and Internal/sub-account Transfers, but do not
    publish the literal bit assignments in the pages this project could
    fetch. The bit layout below is this project's best-effort convention
    (lowest bits = most dangerous capabilities first) -- confirm against the
    authoritative schema/OpenAPI spec before relying on it to restrict a key
    on mainnet, and adjust the values here if they differ.
    """

    NONE = 0
    TRADE = 1 << 0
    CANCEL = 1 << 1
    WITHDRAW = 1 << 2
    TRANSFER = 1 << 3
    ALL = TRADE | CANCEL | WITHDRAW | TRANSFER

    @classmethod
    def automation_default(cls) -> "Permission":
        """What every AI-managed automation key should be scoped to:
        trade + cancel, NEVER withdraw or transfer. Even if the execution
        service is fully compromised, funds cannot leave the account."""
        return cls.TRADE | cls.CANCEL


@dataclass
class GeneratedApiKey:
    name: str
    address: str
    private_key: str  # caller is responsible for encrypting this at rest


def generate_api_key(name: str) -> GeneratedApiKey:
    """Creates a fresh secp256k1 keypair to register as an API key.
    Real cryptography (eth_account), not a placeholder."""
    acct = Account.create()
    return GeneratedApiKey(name=name, address=acct.address, private_key=acct.key.hex())


@dataclass
class SubAccountAutomation:
    """One row of platform-side bookkeeping per automation: which
    sub-account it trades on, and which scoped API key signs for it.

    Mirrors the `Automation` struct sketched in the product design notes:
        Automation { id, userID, accountID, apiKeyName,
                     encryptedPrivateKey, strategy, mode, permissions, status }
    Persist this in your own database; only the *encrypted* private key
    should ever be stored, and only the execution service should decrypt it.
    """

    automation_id: str
    user_id: str
    account_id: int
    api_key_name: str
    api_key_address: str
    permissions: Permission
    status: str = "ACTIVE"  # ACTIVE | PAUSED | REVOKED


class AccountManager:
    """High-level operations for onboarding a user's sub-accounts and
    provisioning one scoped, revocable API key per automation."""

    def __init__(self, client: SodexPerpsClient) -> None:
        self._client = client

    async def resolve_account_id(
        self, user_address: str, sub_account_id: Optional[int] = None
    ) -> int:
        """Look up the on-chain account ID for the primary account or a
        given sub-account, per docs' "Get account ID"."""
        return await self._client.get_account_id(user_address, sub_account_id)

    async def provision_automation_key(
        self,
        *,
        user_id: str,
        account_id: int,
        automation_id: str,
        permissions: Permission = Permission.automation_default(),
    ) -> tuple[SubAccountAutomation, GeneratedApiKey]:
        """Creates a brand-new keypair, registers it as a PERMISSIONED API
        key scoped to `account_id` (never a shared key -- see module
        docstring), and returns the bookkeeping row + the raw private key
        for the caller to encrypt and hand to the execution service.
        """
        key_name = f"automation-{automation_id}"[:36]
        generated = generate_api_key(key_name)
        await self._client.add_permissioned_api_key(
            account_id=account_id,
            name=key_name,
            public_key=generated.address,
            permissions=int(permissions),
        )
        row = SubAccountAutomation(
            automation_id=automation_id,
            user_id=user_id,
            account_id=account_id,
            api_key_name=key_name,
            api_key_address=generated.address,
            permissions=permissions,
        )
        return row, generated

    async def revoke_automation_key(self, *, account_id: int, api_key_name: str) -> None:
        await self._client.revoke_api_key(account_id=account_id, name=api_key_name)

    @staticmethod
    def signing_identity(
        automation: SubAccountAutomation, decrypted_private_key: str
    ) -> SigningIdentity:
        return SigningIdentity(
            api_key_name=automation.api_key_name,
            private_key=decrypted_private_key,
            domain_name="futures",
        )
