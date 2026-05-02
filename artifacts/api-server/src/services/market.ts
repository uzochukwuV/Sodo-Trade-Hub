import { logger } from "../lib/logger";

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

const SODEX_SYMBOL: Record<string, string> = {
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
    const res = await fetch(`${SODEX_BASE}/perps/markets/tickers`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as { code: number; data: SodexTicker[] };
    if (json.code !== 0) throw new Error(`Sodex error ${json.code}`);

    const prices = json.data
      .filter(t => REVERSE[t.symbol])
      .map(t => ({
        symbol:       REVERSE[t.symbol],
        price:        parseFloat(t.markPrice),
        change24h:    t.changePct,
        openInterest: parseFloat(t.openInterest),
        fundingRate:  parseFloat(t.fundingRate),
        markPrice:    parseFloat(t.markPrice),
        indexPrice:   parseFloat(t.indexPrice),
      }));

    setCached("prices", prices, 30_000);
    return prices;
  } catch (err) {
    logger.warn({ err }, "Sodex price fetch failed, using stale/empty");
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

export async function getKlines(symbol: string, days = 1): Promise<Kline[]> {
  const key = `klines:${symbol}:${days}`;
  const cached = getCached<Kline[]>(key);
  if (cached) return cached;

  const cgId = COINGECKO_ID[symbol];
  if (!cgId) return [];

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const raw = await res.json() as Array<[number, number, number, number, number]>;

    const klines = raw.map(([time, open, high, low, close]) => ({
      time, open, high, low, close,
    }));

    setCached(key, klines, 5 * 60_000);
    return klines;
  } catch (err) {
    logger.warn({ err, symbol }, "CoinGecko klines fetch failed");
    return [];
  }
}

export function getMarketVibeSummary(prices: MarketPrice[], news: NewsItem[]): string {
  const btc = prices.find(p => p.symbol === "BTC/USDT");
  const eth = prices.find(p => p.symbol === "ETH/USDT");
  const sol = prices.find(p => p.symbol === "SOL/USDT");

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
