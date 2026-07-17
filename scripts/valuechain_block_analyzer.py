#!/usr/bin/env python3
"""
On-demand ValueChain block analyzer proof of concept.

What it does:
- Analyzes the last N ValueChain blocks on demand.
- Extracts candidate addresses from tx.from, tx.to, calldata 32-byte words, and receipt log topics/data.
- Queries SoDEX perps account endpoints for candidate addresses.
- Saves each block analysis to a local SQLite cache so repeated runs do not re-query the same block.

No third-party dependencies.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_RPC = "https://testnet-v2.valuechain.xyz"
DEFAULT_SODEX = "https://testnet-gw.sodex.dev/api/v1/perps"
DEFAULT_CACHE = "scripts/valuechain_block_cache.sqlite"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def post_json(url: str, payload: Any, timeout: int = 20) -> Any:
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "curl/8.5.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"POST {url} failed: {exc}") from exc


def get_json(url: str, timeout: int = 20) -> Any:
    req = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "curl/8.5.0",
            "Origin": "https://sodex.com",
            "Referer": "https://sodex.com",
        },
        method="GET",
    )
    try:
        with urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        return {"code": -1, "message": str(exc), "data": []}


class Rpc:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self.next_id = 1

    def call(self, method: str, params: list[Any]) -> Any:
        payload = {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}
        self.next_id += 1
        response = post_json(self.endpoint, payload)
        if response.get("error"):
            raise RuntimeError(f"RPC {method} failed: {response['error']}")
        return response.get("result")

    def batch(self, calls: list[tuple[str, list[Any]]]) -> list[Any]:
        payload = []
        for method, params in calls:
            payload.append({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params})
            self.next_id += 1
        response = post_json(self.endpoint, payload)
        if not isinstance(response, list):
            raise RuntimeError(f"RPC batch failed: {response}")
        response.sort(key=lambda item: item["id"])
        out = []
        for item in response:
            if item.get("error"):
                out.append(None)
            else:
                out.append(item.get("result"))
        return out


def init_cache(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        create table if not exists block_analysis_cache (
          block_number integer primary key,
          block_hash text,
          tx_count integer not null,
          candidate_count integer not null,
          sodex_match_count integer not null,
          analyzed_at text not null,
          analysis_json text not null
        )
        """
    )
    conn.commit()
    return conn


def get_cached(conn: sqlite3.Connection, block_number: int) -> dict[str, Any] | None:
    row = conn.execute(
        "select analysis_json from block_analysis_cache where block_number = ?",
        (block_number,),
    ).fetchone()
    if not row:
        return None
    return json.loads(row[0])


def save_cached(conn: sqlite3.Connection, analysis: dict[str, Any]) -> None:
    conn.execute(
        """
        insert into block_analysis_cache
          (block_number, block_hash, tx_count, candidate_count, sodex_match_count, analyzed_at, analysis_json)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(block_number) do update set
          block_hash = excluded.block_hash,
          tx_count = excluded.tx_count,
          candidate_count = excluded.candidate_count,
          sodex_match_count = excluded.sodex_match_count,
          analyzed_at = excluded.analyzed_at,
          analysis_json = excluded.analysis_json
        """,
        (
            analysis["blockNumber"],
            analysis["blockHash"],
            analysis["txCount"],
            len(analysis["candidateAddresses"]),
            len(analysis["sodexMatches"]),
            analysis["analyzedAt"],
            json.dumps(analysis, separators=(",", ":")),
        ),
    )
    conn.commit()


def is_address(value: str) -> bool:
    if not isinstance(value, str):
        return False
    value = value.lower()
    return len(value) == 42 and value.startswith("0x") and all(ch in "0123456789abcdef" for ch in value[2:])


def normalize_address(value: str | None) -> str | None:
    if not value:
        return None
    value = value.lower()
    if is_address(value):
        return value
    return None


def addresses_from_hex_words(hex_data: str | None) -> set[str]:
    found: set[str] = set()
    if not hex_data or not isinstance(hex_data, str) or not hex_data.startswith("0x"):
        return found
    data = hex_data[2:].lower()
    if len(data) < 64:
        return found
    for i in range(0, len(data) - 63, 64):
        word = data[i : i + 64]
        if len(word) != 64:
            continue
        addr = "0x" + word[-40:]
        if is_address(addr) and addr != "0x0000000000000000000000000000000000000000":
            found.add(addr)
    return found


def extract_candidate_addresses(block: dict[str, Any], receipts: list[dict[str, Any]]) -> set[str]:
    candidates: set[str] = set()

    for tx in block.get("transactions", []) or []:
        for field in ("from", "to"):
            addr = normalize_address(tx.get(field))
            if addr:
                candidates.add(addr)
        candidates.update(addresses_from_hex_words(tx.get("input")))

    for receipt in receipts:
        for log in receipt.get("logs", []) or []:
            addr = normalize_address(log.get("address"))
            if addr:
                candidates.add(addr)
            for topic in log.get("topics", []) or []:
                candidates.update(addresses_from_hex_words(topic))
            candidates.update(addresses_from_hex_words(log.get("data")))

    return candidates


def fetch_block_receipts(rpc: Rpc, block_hex: str, block: dict[str, Any]) -> list[dict[str, Any]]:
    receipts = rpc.call("eth_getBlockReceipts", [block_hex])
    if isinstance(receipts, list):
        return receipts
    tx_hashes = [tx.get("hash") for tx in block.get("transactions", []) or [] if tx.get("hash")]
    if not tx_hashes:
        return []
    fetched = rpc.batch([("eth_getTransactionReceipt", [tx_hash]) for tx_hash in tx_hashes])
    return [r for r in fetched if isinstance(r, dict)]


def sodex_get_account(base_url: str, address: str, path: str, limit: int) -> list[dict[str, Any]]:
    query = urlencode({"limit": limit})
    url = f"{base_url}/accounts/{address}/{path}?{query}"
    data = get_json(url)
    if data.get("code") != 0:
        return []
    rows = data.get("data") or []
    return rows if isinstance(rows, list) else []


def query_sodex_for_address(base_url: str, address: str, limit: int) -> dict[str, Any] | None:
    trades = sodex_get_account(base_url, address, "trades", limit)
    positions = sodex_get_account(base_url, address, "positions/history", limit)
    orders = sodex_get_account(base_url, address, "orders/history", limit)
    fundings = sodex_get_account(base_url, address, "fundings", limit)
    total = len(trades) + len(positions) + len(orders) + len(fundings)
    if total == 0:
        return None
    return {
        "address": address,
        "counts": {
            "trades": len(trades),
            "positions": len(positions),
            "orders": len(orders),
            "fundings": len(fundings),
        },
        "samples": {
            "trades": trades[:3],
            "positions": positions[:3],
            "orders": orders[:3],
            "fundings": fundings[:3],
        },
    }


@dataclass
class AnalyzeOpts:
    rpc_url: str
    sodex_url: str
    cache_path: str
    blocks: int
    end_block: int | None
    batch_size: int
    max_addresses_per_block: int
    sodex_limit: int
    refresh: bool


def block_hex(n: int) -> str:
    return hex(n)


def analyze_block(rpc: Rpc, opts: AnalyzeOpts, block: dict[str, Any]) -> dict[str, Any]:
    number = int(block["number"], 16)
    receipts = fetch_block_receipts(rpc, block["number"], block)
    candidates = sorted(extract_candidate_addresses(block, receipts))
    limited_candidates = candidates[: opts.max_addresses_per_block]
    sodex_matches = []
    for address in limited_candidates:
        match = query_sodex_for_address(opts.sodex_url, address, opts.sodex_limit)
        if match:
            sodex_matches.append(match)
    return {
        "blockNumber": number,
        "blockHex": block["number"],
        "blockHash": block.get("hash"),
        "timestamp": int(block.get("timestamp", "0x0"), 16),
        "txCount": len(block.get("transactions", []) or []),
        "candidateAddresses": candidates,
        "candidateAddressesQueried": limited_candidates,
        "sodexMatches": sodex_matches,
        "receiptsCount": len(receipts),
        "analyzedAt": now_iso(),
    }


def analyze_range(opts: AnalyzeOpts) -> list[dict[str, Any]]:
    rpc = Rpc(opts.rpc_url)
    conn = init_cache(opts.cache_path)
    latest = int(rpc.call("eth_blockNumber", []), 16)
    end = opts.end_block or latest
    start = max(0, end - opts.blocks + 1)
    all_results: list[dict[str, Any]] = []
    uncached_numbers: list[int] = []

    for n in range(start, end + 1):
        cached = None if opts.refresh else get_cached(conn, n)
        if cached:
            cached["cacheHit"] = True
            all_results.append(cached)
        else:
            uncached_numbers.append(n)

    for i in range(0, len(uncached_numbers), opts.batch_size):
        chunk = uncached_numbers[i : i + opts.batch_size]
        blocks = rpc.batch([("eth_getBlockByNumber", [block_hex(n), True]) for n in chunk])
        for block in blocks:
            if not isinstance(block, dict):
                continue
            analysis = analyze_block(rpc, opts, block)
            analysis["cacheHit"] = False
            save_cached(conn, analysis)
            all_results.append(analysis)
            print(
                f"analyzed block={analysis['blockNumber']} tx={analysis['txCount']} "
                f"candidates={len(analysis['candidateAddresses'])} sodexMatches={len(analysis['sodexMatches'])} cache=miss",
                file=sys.stderr,
            )

    all_results.sort(key=lambda item: item["blockNumber"])
    return all_results


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    matched = [r for r in results if r["sodexMatches"]]
    unique_addresses = sorted({m["address"] for r in matched for m in r["sodexMatches"]})
    return {
        "blocksAnalyzed": len(results),
        "blocksWithTransactions": sum(1 for r in results if r["txCount"] > 0),
        "blocksWithSodexMatches": len(matched),
        "uniqueSodexAddresses": unique_addresses,
        "totalSodexMatches": sum(len(r["sodexMatches"]) for r in results),
        "cacheHits": sum(1 for r in results if r.get("cacheHit")),
        "sampleMatchedBlocks": [
            {
                "blockNumber": r["blockNumber"],
                "txCount": r["txCount"],
                "candidateCount": len(r["candidateAddresses"]),
                "matches": [
                    {
                        "address": m["address"],
                        "counts": m["counts"],
                    }
                    for m in r["sodexMatches"]
                ],
            }
            for r in matched[:10]
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze ValueChain blocks and correlate addresses with SoDEX account history.")
    parser.add_argument("--rpc", default=DEFAULT_RPC)
    parser.add_argument("--sodex", default=DEFAULT_SODEX)
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--blocks", type=int, default=100)
    parser.add_argument("--end-block", type=int)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--max-addresses-per-block", type=int, default=25)
    parser.add_argument("--sodex-limit", type=int, default=5)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--json", action="store_true", help="Print full block analyses instead of summary only.")
    args = parser.parse_args()

    opts = AnalyzeOpts(
        rpc_url=args.rpc,
        sodex_url=args.sodex.rstrip("/"),
        cache_path=args.cache,
        blocks=max(1, args.blocks),
        end_block=args.end_block,
        batch_size=max(1, args.batch_size),
        max_addresses_per_block=max(1, args.max_addresses_per_block),
        sodex_limit=max(1, args.sodex_limit),
        refresh=args.refresh,
    )
    started = time.time()
    results = analyze_range(opts)
    output = {"summary": summarize(results), "elapsedSeconds": round(time.time() - started, 2)}
    if args.json:
        output["blocks"] = results
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
