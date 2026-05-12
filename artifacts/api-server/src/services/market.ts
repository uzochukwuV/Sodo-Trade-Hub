import { logger } from "../lib/logger";
import { getMarketActivity, getFillsFromSnapshot } from "./market-activity";
import { getSymbolMeta } from "./sodex-rest";

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

const SODEX_BASE = process.env.SODEX_BASE_URL ?? "https://testnet-gw.sodex.dev/api/v1";
const SOSO_BASE  = process.env.SOSO_BASE_URL  ?? "https://openapi.sosovalue.com/openapi/v1";
const SOSO_KEY   = process.env.SOSO_API_KEY   ?? "";

export const SODEX_SYMBOL: Record<string, string> = {
  "BTC/USDT":  "BTC-USD",
  "ETH/USDT":  "ETH-USD",
  "SOL/USDT":  "SOL-USD",
  "BNB/USDT":  "BNB-USD",
  "ARB/USDT":  "ARB-USD",
  "OP/USDT":   "OP-USD",
  "AVAX/USDT": "AVAX-USD",
};

const COINGECKO_ID: Record<string, string> = {
  "BTC/USDT":  "bitcoin",
  "ETH/USDT":  "ethereum",
  "SOL/USDT":  "solana",
  "BNB/USDT":  "binancecoin",
  "ARB/USDT":  "arbitrum",
  "OP/USDT":   "optimism",
  "AVAX/USDT": "avalanche-2",
};

export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
  openInterest: number;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
}

interface SodexTicker {
  symbol: string;
  lastPx: string;
  markPrice: string;
  indexPrice: string;
  changePct: number;
  openInterest: string;
  fundingRate: string;
}

const REVERSE = Object.fromEntries(Object.entries(SODEX_SYMBOL).map(([k, v]) => [v, k]));

/**
 * Now reads from the live WS-fed market snapshot (services/market-activity.ts).
 * The snapshot is updated continuously from `allMiniTicker` + `allMarkPrice`
 * with a 60s REST safety refresh, so prices are usually <1s old.
 */
export async function getMarketPrices(): Promise<MarketPrice[]> {
  const cached = getCached<MarketPrice[]>("prices");
  if (cached) return cached;

  try {
    const activity = await getMarketActivity();
    const prices = activity
      .filter(a => REVERSE[a.symbol])
      .map(a => ({
        symbol:       REVERSE[a.symbol],
        price:        a.markPrice,
        change24h:    a.changePct24h,
        openInterest: a.openInterestUsd > 0 && a.markPrice > 0 ? a.openInterestUsd / a.markPrice : 0,
        fundingRate:  a.fundingRate,
        markPrice:    a.markPrice,
        indexPrice:   a.indexPrice,
      }));
    setCached("prices", prices, 5_000);
    return prices;
  } catch (err) {
    logger.warn({ err }, "live market snapshot read failed, using stale/empty");
    return getCached<MarketPrice[]>("prices") ?? [];
  }
}

export async function getPrice(symbol: string): Promise<number | null> {
  const prices = await getMarketPrices();
  return prices.find(p => p.symbol === symbol)?.price ?? null;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  summary?: string;
  coins?: string[];
}

export async function getNews(limit = 10): Promise<NewsItem[]> {
  const cached = getCached<NewsItem[]>("news");
  if (cached) return cached.slice(0, limit);

  try {
    const res = await fetch(`${SOSO_BASE}/news?limit=20`, {
      headers: { "x-soso-api-key": SOSO_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as {
      code: number;
      data: Array<{
        id?: string;
        newsId?: string;
        title?: string;
        titleEn?: string;
        url?: string;
        link?: string;
        publishedAt?: string;
        publishTime?: number;
        source?: string;
        sourceName?: string;
        summary?: string;
        relatedCoins?: string[];
        coins?: string[];
      }>;
    };

    if (json.code !== 0 && json.code !== undefined) throw new Error(`SoSo error ${json.code}`);

    const items: NewsItem[] = (json.data ?? []).map((n, i) => ({
      id:          String(n.id ?? n.newsId ?? i),
      title:       n.titleEn ?? n.title ?? "",
      url:         n.url ?? n.link ?? "#",
      publishedAt: n.publishedAt ?? (n.publishTime ? new Date(n.publishTime).toISOString() : new Date().toISOString()),
      source:      n.sourceName ?? n.source ?? "SoSoValue",
      summary:     n.summary,
      coins:       n.relatedCoins ?? n.coins,
    }));

    setCached("news", items, 5 * 60_000);
    return items.slice(0, limit);
  } catch (err) {
    logger.warn({ err }, "SoSoValue news fetch failed");
    return getCached<NewsItem[]>("news")?.slice(0, limit) ?? [];
  }
}

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SodexKline {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  q: string;
}

async function getSodexKlines(sodexSymbol: string, interval: string, limit: number): Promise<Kline[]> {
  const res = await fetch(
    `${SODEX_BASE}/perps/markets/${encodeURIComponent(sodexSymbol)}/klines?interval=${interval}&limit=${limit}`,
    { signal: AbortSignal.timeout(8000) }
  );
  const json = await res.json() as { code: number; data: SodexKline[] };
  if (json.code !== 0) throw new Error(`Sodex klines error ${json.code}`);
  return (json.data ?? []).map(k => ({
    time:  k.t,
    open:  parseFloat(k.o),
    high:  parseFloat(k.h),
    low:   parseFloat(k.l),
    close: parseFloat(k.c),
  })).sort((a, b) => a.time - b.time);
}

export async function getKlines(symbol: string, days = 1): Promise<Kline[]> {
  const key = `klines:${symbol}:${days}`;
  const cached = getCached<Kline[]>(key);
  if (cached) return cached;

  const sodexSym = SODEX_SYMBOL[symbol];

  if (sodexSym) {
    try {
      const interval = days <= 1 ? "1h" : days <= 7 ? "4h" : "1d";
      const limit    = days <= 1 ? 24   : days <= 7 ? 42   : 30;
      const klines = await getSodexKlines(sodexSym, interval, limit);
      if (klines.length > 0) {
        setCached(key, klines, 5 * 60_000);
        return klines;
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Sodex klines fetch failed, falling back to CoinGecko");
    }
  }

  const cgId = COINGECKO_ID[symbol];
  if (!cgId) return [];

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const raw = await res.json() as Array<[number, number, number, number, number]>;
    const klines = raw.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
    setCached(key, klines, 5 * 60_000);
    return klines;
  } catch (err) {
    logger.warn({ err, symbol }, "CoinGecko klines fetch failed");
    return [];
  }
}

export interface SodexFill {
  tradeId: string;
  time: number;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
}

interface SodexRawTrade {
  t: string | number;
  T: number;
  s: string;
  S: "BUY" | "SELL";
  p: string;
  q: string;
}

/**
 * Primary path: read the WS-maintained rolling fill window from market-activity.
 * REST is only consulted when WS has no data for the symbol (fresh boot,
 * symbol the WS feed has never quoted, or recovery after a long disconnect).
 *
 * The `tradeId` for snapshot-derived fills is synthesised as `ts:price:qty`
 * since WS trade frames don't always carry the same numeric ID the REST feed
 * uses. `verifySodexTrade` falls back to the REST path when given a numeric
 * Sodex trade ID, so verification is unaffected.
 */
export async function getFills(symbol: string, limit = 50): Promise<SodexFill[]> {
  const sodexSym = SODEX_SYMBOL[symbol] ?? symbol;
  const uiSym   = REVERSE[sodexSym] ?? sodexSym;

  const live = getFillsFromSnapshot(sodexSym, limit);
  if (live.length > 0) {
    return live.map(f => ({
      tradeId:  `${f.ts}:${f.price}:${f.qty}`,
      time:     f.ts,
      symbol:   uiSym,
      side:     f.side,
      price:    f.price,
      quantity: f.qty,
    }));
  }

  const key = `fills:${sodexSym}`;
  const cached = getCached<SodexFill[]>(key);
  if (cached) return cached.slice(0, limit);

  try {
    const res = await fetch(
      `${SODEX_BASE}/perps/markets/${encodeURIComponent(sodexSym)}/trades?limit=${limit}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const json = await res.json() as { code: number; data: SodexRawTrade[] };
    if (json.code !== 0) throw new Error(`Sodex fills error ${json.code}`);

    const fills: SodexFill[] = (json.data ?? []).map(t => ({
      tradeId:  String(t.t),
      time:     t.T,
      symbol:   REVERSE[t.s] ?? t.s,
      side:     t.S,
      price:    parseFloat(t.p),
      quantity: parseFloat(t.q),
    }));

    setCached(key, fills, 15_000);
    return fills.slice(0, limit);
  } catch (err) {
    logger.warn({ err, symbol }, "Sodex fills fetch failed");
    return getCached<SodexFill[]>(key)?.slice(0, limit) ?? [];
  }
}

export interface VerifyResult {
  verified: boolean;
  matchedFill?: SodexFill;
  reason?: string;
}

export async function verifySodexTrade(
  symbol: string,
  sodexTradeId: string,
  side: "LONG" | "SHORT",
  claimedPrice: number
): Promise<VerifyResult> {
  const sodexSide = side === "LONG" ? "BUY" : "SELL";
  try {
    const fills = await getFills(symbol, 200);
    const match = fills.find(f => f.tradeId === sodexTradeId);

    if (!match) {
      return { verified: false, reason: "Trade ID not found in recent Sodex fills (last 200)" };
    }

    if (match.side !== sodexSide) {
      return { verified: false, reason: `Side mismatch: expected ${sodexSide}, got ${match.side}` };
    }

    // Tolerance derived from the symbol's tick size (≥ 5 ticks or 2% — whichever is smaller).
    const meta = getSymbolMeta(SODEX_SYMBOL[symbol] ?? symbol);
    const tickTol = meta && claimedPrice > 0 ? Math.max((meta.tickSize * 5) / claimedPrice, 0.001) : 0.02;
    const tolerance = Math.min(tickTol, 0.02);
    const priceDiff = Math.abs(match.price - claimedPrice) / claimedPrice;
    if (priceDiff > tolerance) {
      return {
        verified: false,
        reason: `Price mismatch: Sodex fill at ${match.price}, claimed ${claimedPrice} (${(priceDiff * 100).toFixed(2)}% diff > ${(tolerance * 100).toFixed(2)}%)`,
      };
    }

    return { verified: true, matchedFill: match };
  } catch (err) {
    logger.warn({ err, symbol, sodexTradeId }, "Sodex trade verification failed");
    return { verified: false, reason: "Verification service unavailable" };
  }
}

export function getMarketVibeSummary(prices: MarketPrice[], news: NewsItem[]): string {
  const btc = prices.find(p => p.symbol === "BTC/USDT");

  const topMovers = prices
    .filter(p => Math.abs(p.change24h) > 1)
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 2);

  const bullish = prices.filter(p => p.change24h > 0).length;
  const bearish = prices.filter(p => p.change24h < 0).length;
  const sentiment = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";

  const btcStr = btc ? `BTC at $${btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${btc.change24h > 0 ? "+" : ""}${btc.change24h.toFixed(2)}%)` : "";
  const moversStr = topMovers.map(p => {
    const base = p.symbol.split("/")[0];
    return `${base} ${p.change24h > 0 ? "+" : ""}${p.change24h.toFixed(1)}%`;
  }).join(", ");

  const headlines = news.slice(0, 2).map(n => n.title).join(". ");

  const vibes = {
    bullish: `Market is showing strength. ${btcStr}. ${moversStr ? `Top movers: ${moversStr}.` : ""} Crowd is positioned long. ${headlines ? `Headlines: ${headlines}` : ""}`.trim(),
    bearish: `Pressure building across the board. ${btcStr}. ${moversStr ? `Biggest moves: ${moversStr}.` : ""} Shorts dominating open interest. ${headlines ? `Key news: ${headlines}` : ""}`.trim(),
    neutral: `Mixed signals across all majors. ${btcStr}. ${moversStr ? `Watch: ${moversStr}.` : ""} No clear directional bias — wait for confirmation. ${headlines ? `In the news: ${headlines}` : ""}`.trim(),
  };

  return vibes[sentiment];
}
