import { logger } from "../lib/logger";

const GW_BASE = process.env["SODEX_GW_BASE"] ?? "https://mainnet-gw.sodex.dev/api/v1";
const HEADERS = { Origin: "https://sodex.com", Referer: "https://sodex.com/" };

export type SymbolMeta = {
  symbol: string;        // "BTC-USD"
  tickSize: number;      // smallest price increment
  stepSize: number;      // smallest quantity increment
  minNotional: number;
  maxLeverage: number;
};

let _symbolMeta: Map<string, SymbolMeta> | null = null;

interface SodexSymbol {
  symbol: string;
  tickSize?: string;
  stepSize?: string;
  minNotional?: string;
  maxLeverage?: number | string;
  priceTick?: string;
  qtyStep?: string;
}

/** Fetch and cache /markets/symbols once. Safe to call repeatedly; refreshes every hour. */
export async function loadSymbolMeta(force = false): Promise<Map<string, SymbolMeta>> {
  if (_symbolMeta && !force) return _symbolMeta;
  try {
    const res = await fetch(`${GW_BASE}/perps/markets/symbols`, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { code: number; data?: SodexSymbol[] };
    if (json.code !== 0 || !json.data) throw new Error(`symbols err ${json.code}`);
    const map = new Map<string, SymbolMeta>();
    for (const s of json.data) {
      map.set(s.symbol, {
        symbol: s.symbol,
        tickSize: parseFloat(s.tickSize ?? s.priceTick ?? "0.01"),
        stepSize: parseFloat(s.stepSize ?? s.qtyStep ?? "0.001"),
        minNotional: parseFloat(s.minNotional ?? "0"),
        maxLeverage: Number(s.maxLeverage ?? 50),
      });
    }
    _symbolMeta = map;
    logger.info({ event: "sodex.symbols_loaded", count: map.size }, "sodex symbol metadata cached");
    return map;
  } catch (err) {
    logger.warn({ event: "sodex.symbols_fail", err: String(err) }, "symbols fetch failed");
    if (!_symbolMeta) _symbolMeta = new Map();
    return _symbolMeta;
  }
}

export function getSymbolMeta(symbol: string): SymbolMeta | undefined {
  return _symbolMeta?.get(symbol);
}

/** Aggregated account state — replaces 3 separate balances+positions+orders calls. */
export type AccountState = {
  balances: unknown;
  positions: unknown;
  openOrders: unknown;
  fetchedAt: number;
};

export async function getAccountState(addr: string): Promise<AccountState | null> {
  try {
    const res = await fetch(`${GW_BASE}/perps/accounts/${addr}/state`, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { code: number; data?: { balances?: unknown; positions?: unknown; openOrders?: unknown } };
    if (json.code !== 0 || !json.data) return null;
    return {
      balances: json.data.balances ?? null,
      positions: json.data.positions ?? null,
      openOrders: json.data.openOrders ?? null,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    logger.warn({ event: "sodex.account_state_fail", addr, err: String(err) }, "account state fetch failed");
    return null;
  }
}

/** Trade execution history for a wallet (lighter than positions/history). */
export async function getAccountTrades(addr: string, limit = 50): Promise<unknown[]> {
  try {
    const res = await fetch(`${GW_BASE}/perps/accounts/${addr}/trades?limit=${limit}`, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { code: number; data?: unknown[] };
    if (json.code !== 0) return [];
    return json.data ?? [];
  } catch (err) {
    logger.warn({ event: "sodex.account_trades_fail", addr, err: String(err) }, "account trades fetch failed");
    return [];
  }
}

/** Order placement history (filled/cancelled), for trader-profile drill-down. */
export async function getOrdersHistory(addr: string, limit = 50): Promise<unknown[]> {
  try {
    const res = await fetch(`${GW_BASE}/perps/accounts/${addr}/orders/history?limit=${limit}`, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { code: number; data?: unknown[] };
    if (json.code !== 0) return [];
    return json.data ?? [];
  } catch (err) {
    logger.warn({ event: "sodex.orders_history_fail", addr, err: String(err) }, "orders history fetch failed");
    return [];
  }
}
