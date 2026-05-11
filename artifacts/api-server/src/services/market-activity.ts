import { logger } from "../lib/logger";

const SODEX_BASE = process.env.SODEX_BASE_URL ?? "https://mainnet-gw.sodex.dev/api/v1";

interface CacheEntry { data: unknown; expires: number }
const _cache = new Map<string, CacheEntry>();
function getCached<T>(key: string): T | null {
  const e = _cache.get(key);
  if (e && Date.now() < e.expires) return e.data as T;
  return null;
}
function setCached(key: string, data: unknown, ttlMs: number) {
  _cache.set(key, { data, expires: Date.now() + ttlMs });
}

export type MarketActivity = {
  symbol: string;          // e.g. "BTC-USD"
  displaySymbol: string;   // e.g. "BTC"
  markPrice: number;
  indexPrice: number;
  changePct24h: number;
  volume24hUsd: number;
  openInterestUsd: number;
  fundingRate: number;
  fillCount15m: number;
  buyRatio15m: number;     // 0..1, fraction of fills that were BUY
  netFlow15mUsd: number;   // (buys - sells) * price summed
  lastFillTs: number;
};

interface SodexTicker {
  symbol: string;
  lastPx: string;
  markPrice: string;
  indexPrice: string;
  changePct: number;
  openInterest: string;
  fundingRate: string;
  volume?: string;        // base asset volume 24h
  quoteVolume?: string;   // USD volume 24h
}

interface SodexRawTrade {
  t: string | number;
  T: number;
  s: string;
  S: "BUY" | "SELL";
  p: string;
  q: string;
}

async function fetchTickers(): Promise<SodexTicker[]> {
  const res = await fetch(`${SODEX_BASE}/perps/markets/tickers`, { signal: AbortSignal.timeout(8000) });
  const json = await res.json() as { code: number; data: SodexTicker[] };
  if (json.code !== 0) throw new Error(`Sodex tickers err ${json.code}`);
  return json.data ?? [];
}

async function fetchRecentFills(symbol: string, limit = 100): Promise<SodexRawTrade[]> {
  try {
    const res = await fetch(
      `${SODEX_BASE}/perps/markets/${encodeURIComponent(symbol)}/trades?limit=${limit}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const json = await res.json() as { code: number; data: SodexRawTrade[] };
    if (json.code !== 0) return [];
    return json.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Aggregate per-symbol perp activity for the markets dashboard.
 * - tickers: 24h price/vol/funding (one HTTP call covers all 30 markets)
 * - fills: per-symbol last 15m flow (parallel calls)
 * Cached 30s.
 */
export async function getMarketActivity(): Promise<MarketActivity[]> {
  const cached = getCached<MarketActivity[]>("activity");
  if (cached) return cached;

  let tickers: SodexTicker[];
  try {
    tickers = await fetchTickers();
  } catch (err) {
    logger.warn({ err }, "tickers fetch failed");
    return getCached<MarketActivity[]>("activity") ?? [];
  }

  const cutoff = Date.now() - 15 * 60_000;

  const enriched = await Promise.all(tickers.map(async (t): Promise<MarketActivity> => {
    const fills = await fetchRecentFills(t.symbol, 100);
    const recent = fills.filter(f => f.T >= cutoff);
    const buys = recent.filter(f => f.S === "BUY");
    const sells = recent.filter(f => f.S === "SELL");
    const buyVol = buys.reduce((s, f) => s + parseFloat(f.q) * parseFloat(f.p), 0);
    const sellVol = sells.reduce((s, f) => s + parseFloat(f.q) * parseFloat(f.p), 0);
    const lastFill = recent[0]?.T ?? 0;

    const markPrice = parseFloat(t.markPrice);
    const oiUsd = parseFloat(t.openInterest) * markPrice;

    return {
      symbol: t.symbol,
      displaySymbol: t.symbol.replace("-USD", ""),
      markPrice,
      indexPrice: parseFloat(t.indexPrice),
      changePct24h: t.changePct,
      volume24hUsd: parseFloat(t.quoteVolume ?? "0"),
      openInterestUsd: oiUsd,
      fundingRate: parseFloat(t.fundingRate),
      fillCount15m: recent.length,
      buyRatio15m: recent.length > 0 ? buys.length / recent.length : 0.5,
      netFlow15mUsd: buyVol - sellVol,
      lastFillTs: lastFill,
    };
  }));

  enriched.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  setCached("activity", enriched, 30_000);
  return enriched;
}

export type MarketSummary = {
  totalVolume24hUsd: number;
  totalOpenInterestUsd: number;
  hottestSymbol: string;
  topGainer: { symbol: string; changePct: number };
  topLoser:  { symbol: string; changePct: number };
  bullishCount: number;
  bearishCount: number;
  netFlow15mUsd: number;
};

export function summarize(activity: MarketActivity[]): MarketSummary {
  const totalVol = activity.reduce((s, a) => s + a.volume24hUsd, 0);
  const totalOI  = activity.reduce((s, a) => s + a.openInterestUsd, 0);
  const sortedByChange = [...activity].sort((a, b) => b.changePct24h - a.changePct24h);
  const sortedByFills  = [...activity].sort((a, b) => b.fillCount15m - a.fillCount15m);
  const top    = sortedByChange[0] ?? { displaySymbol: "—", changePct24h: 0 };
  const bottom = sortedByChange[sortedByChange.length - 1] ?? { displaySymbol: "—", changePct24h: 0 };
  return {
    totalVolume24hUsd: totalVol,
    totalOpenInterestUsd: totalOI,
    hottestSymbol: sortedByFills[0]?.displaySymbol ?? "—",
    topGainer: { symbol: top.displaySymbol, changePct: top.changePct24h },
    topLoser:  { symbol: bottom.displaySymbol, changePct: bottom.changePct24h },
    bullishCount: activity.filter(a => a.changePct24h > 0).length,
    bearishCount: activity.filter(a => a.changePct24h < 0).length,
    netFlow15mUsd: activity.reduce((s, a) => s + a.netFlow15mUsd, 0),
  };
}
