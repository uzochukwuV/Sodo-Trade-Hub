import { EventEmitter } from "node:events";

/**
 * Process-wide pub/sub bus that connects WS/REST ingest paths to the SSE
 * stream and to anything else (alerts, debugging) that wants to react to
 * realtime activity. Kept intentionally untyped at the EventEmitter level
 * — typed wrappers are exported below so callers stay honest.
 */
export type PriceTick = {
  symbol: string;        // e.g. "BTC-USD"
  displaySymbol: string; // e.g. "BTC"
  markPrice: number;
  changePct24h: number;
  ts: number;
};

export type NewTradeEvent = {
  tradeId: number;
  traderId: number;
  username: string;
  asset: string;
  side: "LONG" | "SHORT";
  pnlUsd: number;
  leverage: number;
  ts: number;
};

export type NewSignalEvent = {
  signalId: number;
  traderId: number;
  username: string;
  asset: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  leverage: number;
  ts: number;
};

const _bus = new EventEmitter();
_bus.setMaxListeners(500);

export function emitPriceTick(t: PriceTick) { _bus.emit("price_tick", t); }
export function emitNewTrade(t: NewTradeEvent) { _bus.emit("new_trade", t); }
export function emitNewSignal(s: NewSignalEvent) { _bus.emit("new_signal", s); }

export function onPriceTick(fn: (t: PriceTick) => void)   { _bus.on("price_tick", fn); return () => _bus.off("price_tick", fn); }
export function onNewTrade(fn: (t: NewTradeEvent) => void) { _bus.on("new_trade", fn); return () => _bus.off("new_trade", fn); }
export function onNewSignal(fn: (s: NewSignalEvent) => void) { _bus.on("new_signal", fn); return () => _bus.off("new_signal", fn); }
