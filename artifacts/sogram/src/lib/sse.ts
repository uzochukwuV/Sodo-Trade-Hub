import { useEffect, useState, useRef, useSyncExternalStore } from "react";

/**
 * Shared SSE backbone for /api/stream/feed.
 *
 * One process-wide EventSource is shared by every consumer (price strips,
 * feed, trader profile, analytics, pain room) so we don't open N parallel
 * connections — the browser caps these at ~6 per origin.
 *
 * Two surfaces:
 *   - useFeedStream(handlers)  — per-event callbacks (existing API).
 *   - useLiveStatus()          — connection + last-tick state for the
 *                                persistent LIVE indicator.
 */

type PriceTick = { symbol: string; displaySymbol: string; markPrice: number; changePct24h: number; ts: number };
type NewTrade  = { tradeId: number; traderId: number; username: string; asset: string; side: "LONG" | "SHORT"; pnlUsd: number; leverage: number; ts: number };
type NewSignal = { signalId: number; traderId: number; username: string; asset: string; side: "LONG" | "SHORT"; entryPrice: number; leverage: number; ts: number };

export type FeedStreamHandlers = {
  onPriceTick?: (e: PriceTick) => void;
  onNewTrade?:  (e: NewTrade)  => void;
  onNewSignal?: (e: NewSignal) => void;
};

type LiveStatus = {
  connected: boolean;
  lastTickAt: number | null;
  lastTradeAt: number | null;
  lastSignalAt: number | null;
  /** Most recent of any event — what the LIVE indicator surfaces. */
  lastEventAt: number | null;
};

type Listener = {
  onPriceTick?: (e: PriceTick) => void;
  onNewTrade?:  (e: NewTrade)  => void;
  onNewSignal?: (e: NewSignal) => void;
};

class FeedHub {
  private es: EventSource | null = null;
  private listeners = new Set<Listener>();
  private statusSubs = new Set<() => void>();
  status: LiveStatus = { connected: false, lastTickAt: null, lastTradeAt: null, lastSignalAt: null, lastEventAt: null };

  private ensureOpen() {
    if (this.es || typeof window === "undefined") return;
    const es = new EventSource("/api/stream/feed");
    this.es = es;
    es.addEventListener("open", () => { this.patch({ connected: true }); });
    es.addEventListener("error", () => { this.patch({ connected: false }); });
    es.addEventListener("price_tick", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as PriceTick;
        const now = Date.now();
        this.patch({ connected: true, lastTickAt: now, lastEventAt: now });
        this.listeners.forEach(l => l.onPriceTick?.(data));
      } catch { /* ignore */ }
    });
    es.addEventListener("new_trade", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as NewTrade;
        const now = Date.now();
        this.patch({ connected: true, lastTradeAt: now, lastEventAt: now });
        this.listeners.forEach(l => l.onNewTrade?.(data));
      } catch { /* ignore */ }
    });
    es.addEventListener("new_signal", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as NewSignal;
        const now = Date.now();
        this.patch({ connected: true, lastSignalAt: now, lastEventAt: now });
        this.listeners.forEach(l => l.onNewSignal?.(data));
      } catch { /* ignore */ }
    });
  }

  private patch(p: Partial<LiveStatus>) {
    this.status = { ...this.status, ...p };
    this.statusSubs.forEach(fn => fn());
  }

  subscribe(l: Listener): () => void {
    this.ensureOpen();
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  subscribeStatus(fn: () => void): () => void {
    this.ensureOpen();
    this.statusSubs.add(fn);
    return () => { this.statusSubs.delete(fn); };
  }
}

const hub = new FeedHub();

export function useFeedStream(handlers: FeedStreamHandlers) {
  // Keep latest handler refs without re-subscribing on every render.
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    return hub.subscribe({
      onPriceTick: (e) => ref.current.onPriceTick?.(e),
      onNewTrade:  (e) => ref.current.onNewTrade?.(e),
      onNewSignal: (e) => ref.current.onNewSignal?.(e),
    });
  }, []);
}

/** Snapshot of the SSE connection — drives the persistent LIVE indicator. */
export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => hub.subscribeStatus(cb),
    () => hub.status,
    () => hub.status,
  );
}

/**
 * Tracks every `price_tick` emitted by the server in a shared in-memory map.
 * Components opt in (via useLivePrices) to re-render on a polled interval —
 * cheap, decoupled from the SSE firehose, and avoids React floods at 30 Hz.
 */
const livePrices = new Map<string, { price: number; change24h: number; ts: number }>();
hub.subscribe({
  onPriceTick: (e) => {
    livePrices.set(e.symbol, { price: e.markPrice, change24h: e.changePct24h, ts: e.ts });
    livePrices.set(e.displaySymbol, { price: e.markPrice, change24h: e.changePct24h, ts: e.ts });
  },
});

export function getLivePrice(symbol: string): { price: number; change24h: number; ts: number } | undefined {
  return livePrices.get(symbol);
}

/**
 * Re-renders ~2× per second so callers can read the latest livePrices map
 * without each tick triggering a React update. Returns the map snapshot ref
 * — components should look up by symbol with getLivePrice on each render.
 */
export function useLivePriceTick(intervalMs = 500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    // Subscribe to keep the hub open even on pages that don't use useFeedStream.
    const off = hub.subscribe({});
    const id = window.setInterval(() => setN(v => v + 1), intervalMs);
    return () => { off(); window.clearInterval(id); };
  }, [intervalMs]);
  return n;
}
