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

/** Strip HTML tags from content and collapse whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract first image URL from HTML content */
function extractImageUrl(content: string): string | null {
  const m = content.match(/src="(https?:\/\/[^"]+)"/);
  return m ? m[1] : null;
}

/** Raw SoSoValue API item shape */
interface SoSoRawItem {
  id?: string;
  source_link?: string;
  original_link?: string;
  release_time?: string | number;
  title?: string | null;
  content?: string;
  author?: string;
  author_description?: string | null;
  author_avatar_url?: string | null;
  impression_count?: string | number | null;
  like_count?: string | number | null;
  reply_count?: string | number | null;
  retweet_count?: string | number | null;
  category?: number;
  feature_image?: string | null;
  nick_name?: string | null;
  is_blue_verified?: boolean;
  verified_type?: string | null;
  matched_currencies?: Array<{ currency_id?: string; symbol?: string; name?: string }> | null;
  tags?: string[];
  media_info?: Array<{ soso_url?: string | null; original_url?: string | null; type?: string }> | null;
  quote_info?: unknown;
}

export interface IntelligenceItem {
  id: string;
  category: number;
  title: string | null;
  content: string;
  url: string;
  publishedAt: string;
  author: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  isVerified: boolean;
  likes: number;
  replies: number;
  retweets: number;
  impressions: number;
  matchedCoins: Array<{ symbol: string; name: string }>;
  tags: string[];
  imageUrl: string | null;
}

export interface IntelligenceResponse {
  news: IntelligenceItem[];
  kolViews: IntelligenceItem[];
  alerts: IntelligenceItem[];
  fetchedAt: string;
}

function parseNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function mapRawItem(raw: SoSoRawItem, idx: number): IntelligenceItem {
  const rawContent = raw.content ?? "";
  const cleanContent = stripHtml(rawContent);
  const imageFromContent = extractImageUrl(rawContent);
  const imageFromMedia = raw.media_info?.find(m => m.type === "photo" && m.soso_url)?.soso_url ?? null;

  const releaseMs = raw.release_time ? Number(raw.release_time) : Date.now();
  const publishedAt = new Date(releaseMs).toISOString();

  const matchedCoins = (raw.matched_currencies ?? [])
    .filter(c => c.symbol && !c.symbol.startsWith("."))
    .map(c => ({ symbol: c.symbol!, name: c.name ?? c.symbol! }));

  return {
    id:              String(raw.id ?? idx),
    category:        raw.category ?? 1,
    title:           raw.title && raw.title.trim() ? raw.title : null,
    content:         cleanContent,
    url:             raw.source_link ?? raw.original_link ?? "#",
    publishedAt,
    author:          raw.author ?? "",
    authorDisplayName: raw.nick_name ?? raw.author ?? null,
    authorAvatar:    raw.author_avatar_url ?? null,
    isVerified:      raw.is_blue_verified ?? false,
    likes:           parseNum(raw.like_count),
    replies:         parseNum(raw.reply_count),
    retweets:        parseNum(raw.retweet_count),
    impressions:     parseNum(raw.impression_count),
    matchedCoins,
    tags:            (raw.tags ?? []).filter(t => /^[a-zA-Z0-9]/.test(t)),
    imageUrl:        imageFromMedia ?? imageFromContent,
  };
}

/** In-flight deduplication: prevents concurrent cache misses from hitting SoSoValue multiple times */
let _sosoInflight: Promise<SoSoRawItem[]> | null = null;

/** Fetch and cache raw items from SoSoValue news endpoint */
async function fetchRawItems(limit = 40): Promise<SoSoRawItem[]> {
  const cached = getCached<SoSoRawItem[]>("soso_raw");
  if (cached) return cached;

  if (_sosoInflight) return _sosoInflight;

  _sosoInflight = (async () => {
    try {
      const res = await fetch(`${SOSO_BASE}/news?limit=${limit}`, {
        headers: { "x-soso-api-key": SOSO_KEY },
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json() as { code: number; data?: { list?: SoSoRawItem[] } | SoSoRawItem[] };

      let raw: SoSoRawItem[] = [];

      if (json.code === 0 || json.code === undefined) {
        if (Array.isArray(json.data)) {
          raw = json.data;
        } else if (json.data && Array.isArray((json.data as { list?: SoSoRawItem[] }).list)) {
          raw = (json.data as { list: SoSoRawItem[] }).list;
        }
      } else {
        throw new Error(`SoSoValue error code ${json.code}`);
      }

      setCached("soso_raw", raw, 15 * 60_000);
      return raw;
    } finally {
      _sosoInflight = null;
    }
  })();

  return _sosoInflight;
}

// ── Legacy news interface (used by MarketVibe) ──────────────────────────────
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
  try {
    const raw = await fetchRawItems(20);
    const items: NewsItem[] = raw
      .filter(r => r.category === 1 || (r.title && r.title.trim()))
      .map((r, i) => ({
        id:          String(r.id ?? i),
        title:       r.title?.trim() || stripHtml(r.content ?? "").slice(0, 120),
        url:         r.source_link ?? r.original_link ?? "#",
        publishedAt: new Date(Number(r.release_time ?? Date.now())).toISOString(),
        source:      r.nick_name ?? r.author ?? "SoSoValue",
        summary:     r.content ? stripHtml(r.content).slice(0, 200) : undefined,
        coins:       (r.matched_currencies ?? []).map(c => c.symbol!).filter(Boolean),
      }));
    setCached("news", items, 5 * 60_000);
    return items.slice(0, limit);
  } catch (err) {
    logger.warn({ err }, "SoSoValue news fetch failed");
    return getCached<NewsItem[]>("news")?.slice(0, limit) ?? [];
  }
}

// ── Rich intelligence endpoint ──────────────────────────────────────────────
export async function getIntelligence(): Promise<IntelligenceResponse> {
  const cached = getCached<IntelligenceResponse>("intelligence");
  if (cached) return cached;

  try {
    const raw = await fetchRawItems(40);
    const items = raw.map((r, i) => mapRawItem(r, i));

    const result: IntelligenceResponse = {
      news:     items.filter(i => i.category === 1).slice(0, 8),
      kolViews: items.filter(i => i.category === 4).slice(0, 8),
      alerts:   items.filter(i => i.category === 7 || i.category === 13).slice(0, 8),
      fetchedAt: new Date().toISOString(),
    };

    setCached("intelligence", result, 5 * 60_000);
    return result;
  } catch (err) {
    logger.warn({ err }, "SoSoValue intelligence fetch failed");
    return getCached<IntelligenceResponse>("intelligence") ?? {
      news: [], kolViews: [], alerts: [], fetchedAt: new Date().toISOString(),
    };
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
