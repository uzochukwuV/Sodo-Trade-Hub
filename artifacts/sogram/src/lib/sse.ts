import { useEffect, useRef } from "react";

/**
 * Subscribe to the backend SSE stream at /api/stream/feed.
 * Calls the appropriate handler for each event type. Auto-reconnects via the
 * native EventSource implementation. Cleanup on unmount.
 */
export type FeedStreamHandlers = {
  onPriceTick?: (e: { symbol: string; displaySymbol: string; markPrice: number; changePct24h: number; ts: number }) => void;
  onNewTrade?:  (e: { tradeId: number; traderId: number; username: string; asset: string; side: "LONG" | "SHORT"; pnlUsd: number; leverage: number; ts: number }) => void;
  onNewSignal?: (e: { signalId: number; traderId: number; username: string; asset: string; side: "LONG" | "SHORT"; entryPrice: number; leverage: number; ts: number }) => void;
};

export function useFeedStream(handlers: FeedStreamHandlers) {
  // Keep latest handler refs without re-opening the SSE on every render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const es = new EventSource("/api/stream/feed");
    const tick   = (ev: MessageEvent) => { try { ref.current.onPriceTick?.(JSON.parse(ev.data)); } catch { /* ignore */ } };
    const trade  = (ev: MessageEvent) => { try { ref.current.onNewTrade?.(JSON.parse(ev.data));  } catch { /* ignore */ } };
    const signal = (ev: MessageEvent) => { try { ref.current.onNewSignal?.(JSON.parse(ev.data)); } catch { /* ignore */ } };
    es.addEventListener("price_tick", tick);
    es.addEventListener("new_trade", trade);
    es.addEventListener("new_signal", signal);
    return () => {
      es.removeEventListener("price_tick", tick);
      es.removeEventListener("new_trade", trade);
      es.removeEventListener("new_signal", signal);
      es.close();
    };
  }, []);
}
