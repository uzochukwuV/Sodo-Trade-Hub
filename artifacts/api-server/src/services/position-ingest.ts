import { db, tradesTable, signalsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import type { SodexPosition } from "./leaderboard-tracker";
import { notifyTraderClosedPosition, notifyTraderOpenedPosition, notifyIntentAlignment } from "./alerts";
import { emitNewTrade, emitNewSignal } from "./event-bus";
import { getSymbolMeta } from "./sodex-rest";
import { recordWalletIntelligence } from "./wallet-intel";

function uiSymbol(sodexSymbol: string): string {
  return sodexSymbol.replace("-USD", "/USDT");
}

export type IngestResult = { kind: "trade" | "signal" | "skip" };

export type TraderForIngest = {
  id: number;
  username: string;
  walletAddress: string | null;
};

/**
 * Idempotent ingest of one Sodex position into our trades/signals tables.
 *
 * Shared between:
 *   - the WS account stream (services/sodex-ws.ts → bootstrap subscriptions)
 *   - the REST signal-poller safety net (services/signal-poller.ts)
 *
 * Both paths call this with the same `SodexPosition` shape; ON CONFLICT DO NOTHING
 * on the (traderId, sodexTradeId|sodexPositionId) pair guarantees no duplicates
 * even if both paths see the same position. Returning `kind` lets callers tally
 * inserts; callers ignore `skip` for stats.
 */
export async function ingestPosition(trader: TraderForIngest, p: SodexPosition): Promise<IngestResult> {
  const symbol = uiSymbol(p.symbol);
  const side = p.positionSide;
  const isClosed = !p.active && parseFloat(p.cumClosedSize || "0") > 0;
  const isOpen = p.active && parseFloat((p as { size?: string }).size ?? "0") > 0;

  try {
    if (isClosed) {
      const entry = parseFloat(p.avgEntryPrice);
      const exit  = parseFloat(p.avgClosePrice);
      const pnl   = parseFloat(p.realizedPnL);
      const closedSize = parseFloat(p.cumClosedSize);
      const notional = entry * closedSize;
      const pnlPct = notional > 0 ? (pnl / notional) * 100 * p.leverage : 0;
      const inserted = await db.insert(tradesTable).values({
        traderId: trader.id,
        asset: symbol,
        side,
        entryPrice: entry.toFixed(8),
        exitPrice: exit.toFixed(8),
        pnlUsd: pnl.toFixed(2),
        pnlPct: pnlPct.toFixed(4),
        positionSize: notional.toFixed(4),
        leverage: p.leverage,
        isVerified: true,
        isOnChainVerified: true,
        sodexTradeId: String(p.id),
        comment: pnl > 0
          ? `Closed ${side} ${symbol} ${p.leverage}x for +$${pnl.toFixed(0)}`
          : `Stopped out ${side} ${symbol} ${p.leverage}x for -$${Math.abs(pnl).toFixed(0)}`,
        openedAt: p.createdAt ? new Date(p.createdAt) : null,
        closedAt: new Date(p.updatedAt),
      }).onConflictDoNothing({ target: [tradesTable.traderId, tradesTable.sodexTradeId] }).returning();
      if (inserted.length === 0) return { kind: "skip" };

      const tradeId = inserted[0].id;
      logger.info({ event: "ingest.new_trade", trader: trader.username, symbol, pnl, sodexId: p.id }, "ingested closed trade");
      await notifyTraderClosedPosition(trader.id, {
        username: trader.username, asset: symbol, side, pnlUsd: pnl,
        sodexTradeId: String(p.id), walletAddress: trader.walletAddress,
      });
      emitNewTrade({
        tradeId, traderId: trader.id, username: trader.username, asset: symbol, side,
        pnlUsd: pnl, leverage: p.leverage, ts: Date.now(),
      });
      await recordWalletIntelligence(trader, p);
      return { kind: "trade" };
    }

    if (isOpen) {
      const entry = parseFloat(p.avgEntryPrice);
      const meta = getSymbolMeta(p.symbol);
      // Tighter target/stop if we know the tick size (default 5%/3% bands).
      const tgtPct = side === "LONG" ? 1.05 : 0.95;
      const stpPct = side === "LONG" ? 0.97 : 1.03;
      const target = meta ? Math.round(entry * tgtPct / meta.tickSize) * meta.tickSize : entry * tgtPct;
      const stop   = meta ? Math.round(entry * stpPct / meta.tickSize) * meta.tickSize : entry * stpPct;
      const inserted = await db.insert(signalsTable).values({
        traderId: trader.id,
        asset: symbol,
        side,
        entryPrice: entry.toFixed(8),
        targetPrice: target.toFixed(8),
        stopLoss: stop.toFixed(8),
        confidence: 75,
        reasoning: `Live entry detected from ${trader.username} on Sodex perps · ${p.leverage}x ${p.marginMode}`,
        status: "open",
        isActive: true,
        sodexPositionId: String(p.id),
      }).onConflictDoNothing({ target: [signalsTable.traderId, signalsTable.sodexPositionId] }).returning();
      if (inserted.length === 0) return { kind: "skip" };

      const signalId = inserted[0].id;
      logger.info({ event: "ingest.new_signal", trader: trader.username, symbol, side, entry, sodexId: p.id }, "ingested open position as signal");
      await notifyTraderOpenedPosition(trader.id, {
        username: trader.username, asset: symbol, side, entryPrice: entry,
        leverage: p.leverage, sodexPositionId: String(p.id), walletAddress: trader.walletAddress,
      });
      await notifyIntentAlignment({
        asset: symbol, side, tradedByTraderId: trader.id, tradedByUsername: trader.username,
      });
      emitNewSignal({
        signalId, traderId: trader.id, username: trader.username, asset: symbol, side,
        entryPrice: entry, leverage: p.leverage, ts: Date.now(),
      });
      await recordWalletIntelligence(trader, p);
      return { kind: "signal" };
    }
  } catch (err) {
    logger.warn({ event: "ingest.fail", trader: trader.username, sodexId: p.id, err: String(err) }, "ingest insert failed");
  }
  return { kind: "skip" };
}
