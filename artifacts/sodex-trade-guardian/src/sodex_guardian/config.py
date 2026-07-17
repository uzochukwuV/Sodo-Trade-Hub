"""Runtime configuration.

All values are read from the environment (see .env.example). Nothing here is
hard-coded to a specific account so the same deployment can manage many
users, each with their own sub-accounts and scoped API keys.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    sodex_network: str = "testnet"

    sodex_mainnet_perps_endpoint: str = "https://mainnet-gw.sodex.dev/api/v1/perps"
    sodex_mainnet_spot_endpoint: str = "https://mainnet-gw.sodex.dev/api/v1/spot"
    sodex_testnet_perps_endpoint: str = "https://testnet-gw.sodex.dev/api/v1/perps"
    sodex_testnet_spot_endpoint: str = "https://testnet-gw.sodex.dev/api/v1/spot"

    sodex_mainnet_chain_id: int = 286623
    sodex_testnet_chain_id: int = 138565

    sodex_api_chain: int = 1

    sodex_master_wallet_address: str = ""
    sodex_master_wallet_private_key: str = ""

    redis_url: str = "redis://localhost:6379/0"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    encryption_key: str = ""  # base64 Fernet key; generate with Fernet.generate_key()
    notify_webhook_url: str = ""  # optional: Slack/Telegram-compatible JSON webhook

    max_orders_per_batch_request: int = 100
    ai_batch_size: int = 20
    evaluation_workers: int = 4

    @property
    def perps_endpoint(self) -> str:
        return (
            self.sodex_mainnet_perps_endpoint
            if self.sodex_network == "mainnet"
            else self.sodex_testnet_perps_endpoint
        )

    @property
    def spot_endpoint(self) -> str:
        return (
            self.sodex_mainnet_spot_endpoint
            if self.sodex_network == "mainnet"
            else self.sodex_testnet_spot_endpoint
        )

    @property
    def message_chain_id(self) -> int:
        """message.chainID inside EIP-712 payloads: selects mainnet vs testnet."""
        return (
            self.sodex_mainnet_chain_id
            if self.sodex_network == "mainnet"
            else self.sodex_testnet_chain_id
        )

    @property
    def domain_chain_id_for_trading(self) -> int:
        """domain.chainId for ExchangeAction (trading actions). Docs: for mainnet use
        286623, for testnet use 138565 -- same value as message_chain_id here."""
        return self.message_chain_id


@lru_cache
def get_settings() -> Settings:
    return Settings()
