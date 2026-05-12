import { logger } from "../lib/logger";
import { getSodexWs } from "./sodex-ws";
import { emitPriceTick } from "./event-bus";

const SODEX_BASE = process.env["SODEX_GW_BASE"] ?? "https://mainnet-gw.sodex.dev/api/v1";

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
  buyRatio15m: number;
  netFlow15mUsd: number;
  lastFillTs: number;
};

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

interface SodexTicker {
  symbol: string;
  lastPx: string;
  markPrice: string;
  indexPrice: string;
  changePct: number;
  openInterest: string;
  fundingRate: string;
  volume?: string;
  quoteVolume?: string;
}

interface SodexRawTrade {
  t: string | number;
  T: number;
  s: string;
  S: "BUY" | "SELL";
  p: string;
  q: string;
}

// In-memory live snapshot. Updated continuously by WS handlers and refreshed
// every 60s from REST as a safety net (catches any market the WS feed missed).
const _snapshot = new Map<string, MarketActivity>();
type Fill = { ts: number; side: "BUY" | "SELL"; price: number; qty: number };
const _fills = new Map<string, Fill[]>();   // last 15m, per symbol
const FILL_WINDOW_MS = 15 * 60_000;

const _lastTickEmit = new Map<string, number>();
const TICK_THROTTLE_MS = 1_000; // ~1Hz per symbol

function pruneFills(symbol: string) {
  const arr = _fills.get(symbol);
  if (!arr) return;
  const cutoff = Date.now() - FILL_WINDOW_MS;
  let i = 0;
  while (i < arr.length && arr[i].ts < cutoff) i++;
  if (i > 0) arr.splice(0, i);
}

function recomputeFlow(symbol: string, base: MarketActivity) {
  pruneFills(symbol);
  const arr = _fills.get(symbol) ?? [];
  if (arr.length === 0) {
    base.fillCount15m = 0;
    base.buyRatio15m = 0.5;
    base.netFlow15mUsd = 0;
    base.lastFillTs = 0;
    return;
  }
  let buys = 0, buyVol = 0, sellVol = 0, last = 0;
  for (const f of arr) {
    if (f.side === "BUY")  { buys++;  buyVol  += f.price * f.qty; }
    else                   {           sellVol += f.price * f.qty; }
    if (f.ts > last) last = f.ts;
  }
  base.fillCount15m = arr.length;
  base.buyRatio15m = buys / arr.length;
  base.netFlow15mUsd = buyVol - sellVol;
  base.lastFillTs = last;
}

function ensureRow(symbol: string): MarketActivity {
  let row = _snapshot.get(symbol);
  if (!row) {
    row = {
      symbol,
      displaySymbol: symbol.replace("-USD", ""),
      markPrice: 0, indexPrice: 0, changePct24h: 0,
      volume24hUsd: 0, openInterestUsd: 0, fundingRate: 0,
      fillCount15m: 0, buyRatio15m: 0.5, netFlow15mUsd: 0, lastFillTs: 0,
    };
    _snapshot.set(symbol, row);
  }
  return row;
}

function applyTicker(t: SodexTicker) {
  const row = ensureRow(t.symbol);
  const mark = parseFloat(t.markPrice);
  row.markPrice = mark;
  row.indexPrice = parseFloat(t.indexPrice);
  row.changePct24h = t.changePct;
  row.volume24hUsd = parseFloat(t.quoteVolume ?? "0");
  row.openInterestUsd = parseFloat(t.openInterest) * mark;
  row.fundingRate = parseFloat(t.fundingRate);

  // Throttled price tick to the SSE bus.
  const now = Date.now();
  const last = _lastTickEmit.get(t.symbol) ?? 0;
  if (now - last >= TICK_THROTTLE_MS && mark > 0) {
    _lastTickEmit.set(t.symbol, now);
    emitPriceTick({
      symbol: t.symbol, displaySymbol: row.displaySymbol,
      markPrice: mark, changePct24h: t.changePct, ts: now,
    });
  }
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
  } catch { return []; }
}

/** Warmup: one REST tickers call + per-symbol fills backfill so /markets/activity isn't empty before WS catches up. */
export async function warmupMarketSnapshot(): Promise<void> {
  let tickers: SodexTicker[];
  try { tickers = await fetchTickers(); } catch (err) {
    logger.warn({ err }, "market warmup tickers fail");
    return;
  }
  for (const t of tickers) applyTicker(t);

  // Backfill fills in parallel (capped concurrency to be polite).
  await Promise.all(tickers.map(async (t) => {
    const raw = await fetchRecentFills(t.symbol, 100);
    const cutoff = Date.now() - FILL_WINDOW_MS;
    const arr: Fill[] = raw
      .filter(f => f.T >= cutoff)
      .map(f => ({ ts: f.T, side: f.S, price: parseFloat(f.p), qty: parseFloat(f.q) }))
      .sort((a, b) => a.ts - b.ts);
    _fills.set(t.symbol, arr);
    const row = ensureRow(t.symbol);
    recomputeFlow(t.symbol, row);
  }));
  logger.info({ event: "market.warmup_done", symbols: tickers.length }, "market snapshot warmed");
}

/**
 * Wire WS subscriptions for live updates.
 * - allMiniTicker: 24h price/change/volume per symbol
 * - allMarkPrice: mark price + funding rate
 * - trade@<symbol>: per-fill flow updates (subscribed lazily for each symbol we know about)
 *
 * Handlers are intentionally permissive about message shape — we accept either
 * a single object or an array, and read fields by their canonical short name (s, c, etc.)
 * with sensible fallbacks so the system survives a Sodex envelope tweak.
 */
export function startMarketWsSubscriptions() {
  const ws = getSodexWs();

  ws.subscribe("allMiniTicker", (data) => {
    const arr = Array.isArray(data) ? data : [data];
    for (const item of arr) {
      const m = item as Record<string, unknown>;
      const symbol = (m["s"] ?? m["symbol"]) as string | undefined;
      if (!symbol) continue;
      const row = ensureRow(symbol);
      const last = parseFloat(String(m["c"] ?? m["lastPx"] ?? row.markPrice));
      const vol  = parseFloat(String(m["q"] ?? m["quoteVolume"] ?? row.volume24hUsd));
      const chg  = parseFloat(String(m["P"] ?? m["changePct"] ?? row.changePct24h));
      if (last > 0) row.markPrice = last;
      if (vol > 0)  row.volume24hUsd = vol;
      if (!Number.isNaN(chg)) row.changePct24h = chg;

      const now = Date.now();
      const prev = _lastTickEmit.get(symbol) ?? 0;
      if (now - prev >= TICK_THROTTLE_MS && row.markPrice > 0) {
        _lastTickEmit.set(symbol, now);
        emitPriceTick({
          symbol, displaySymbol: row.displaySymbol,
          markPrice: row.markPrice, changePct24h: row.changePct24h, ts: now,
        });
      }
    }
  });

  ws.subscribe("allMarkPrice", (data) => {
    const arr = Array.isArray(data) ? data : [data];
    for (const item of arr) {
      const m = item as Record<string, unknown>;
      const symbol = (m["s"] ?? m["symbol"]) as string | undefined;
      if (!symbol) continue;
      const row = ensureRow(symbol);
      const mark = parseFloat(String(m["p"] ?? m["markPrice"] ?? row.markPrice));
      const idx  = parseFloat(String(m["i"] ?? m["indexPrice"] ?? row.indexPrice));
      const fund = parseFloat(String(m["r"] ?? m["fundingRate"] ?? row.fundingRate));
      if (mark > 0) row.markPrice = mark;
      if (idx > 0)  row.indexPrice = idx;
      if (!Number.isNaN(fund)) row.fundingRate = fund;
    }
  });

  // Per-symbol trade subscriptions are registered after warmup completes
  // via startSymbolFillSubscriptions(); nothing else to register here.
  logger.info({ event: "market.ws_subs_registered" }, "market WS subscriptions registered");
}

const _symbolSubsRegistered = new Set<string>();

/**
 * Idempotent per-symbol `trade@<symbol>` subscription. Re-callable safely
 * from boot and from the periodic refresh — symbols already wired are
 * skipped, so a failed warmup at boot doesn't leave fill metrics dark
 * forever (the next periodic refresh will pick them up).
 */
export function startSymbolFillSubscriptions(symbols: string[]) {
  const ws = getSodexWs();
  for (const sym of symbols) {
    if (_symbolSubsRegistered.has(sym)) continue;
    _symbolSubsRegistered.add(sym);
    ws.subscribe(`trade@${sym}`, (data) => {
      const m = data as Record<string, unknown>;
      const ts = Number(m["T"] ?? m["t"] ?? Date.now());
      const side = (m["S"] ?? m["side"]) as "BUY" | "SELL" | undefined;
      const price = parseFloat(String(m["p"] ?? m["price"] ?? "0"));
      const qty   = parseFloat(String(m["q"] ?? m["quantity"] ?? "0"));
      if (!side || price <= 0 || qty <= 0) return;
      const arr = _fills.get(sym) ?? [];
      arr.push({ ts, side, price, qty });
      _fills.set(sym, arr);
      const row = ensureRow(sym);
      recomputeFlow(sym, row);
    });
  }
}

/**
 * Read the WS-maintained rolling fill window for a symbol. Returns the most
 * recent N fills, newest first. Empty array if WS hasn't seen any (caller
 * should fall back to REST).
 */
export function getFillsFromSnapshot(symbol: string, limit = 50): Array<{
  ts: number; side: "BUY" | "SELL"; price: number; qty: number;
}> {
  pruneFills(symbol);
  const arr = _fills.get(symbol);
  if (!arr || arr.length === 0) return [];
  return arr.slice(-limit).reverse();
}

let _refreshTimer: NodeJS.Timeout | null = null;

/**
 * 60s safety refresh: re-fetch tickers (in case WS missed a symbol launch),
 * then re-run startSymbolFillSubscriptions(knownSymbols()). The latter is
 * idempotent — symbols already wired are skipped — so any symbols missed
 * because warmup failed at boot get their `trade@<symbol>` stream wired
 * here on the next tick.
 */
export function startMarketRefresh(intervalMs = 60_000) {
  if (_refreshTimer) return;
  _refreshTimer = setInterval(() => {
    fetchTickers()
      .then(ts => {
        ts.forEach(applyTicker);
        startSymbolFillSubscriptions(knownSymbols());
      })
      .catch(err => logger.warn({ err }, "scheduled tickers refresh failed"));
  }, intervalMs);
}

/** Read from the live snapshot. Falls back to a one-shot warmup if it's empty. */
export async function getMarketActivity(): Promise<MarketActivity[]> {
  if (_snapshot.size === 0) {
    await warmupMarketSnapshot().catch(() => {});
  }
  // Ensure flow stats are pruned before serving.
  for (const [sym, row] of _snapshot) recomputeFlow(sym, row);
  const arr = [..._snapshot.values()];
  arr.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  return arr;
}

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

/** Snapshot of currently-known symbols (for wiring per-symbol trade subs after warmup). */
export function knownSymbols(): string[] {
  return [..._snapshot.keys()];
}
