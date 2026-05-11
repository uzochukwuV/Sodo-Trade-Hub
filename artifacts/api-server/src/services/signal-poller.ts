import { db, tradersTable, tradesTable, signalsTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchPositions, type SodexPosition } from "./leaderboard-tracker";

function uiSymbol(sodexSymbol: string): string {
  return sodexSymbol.replace("-USD", "/USDT");
}

export type PollerResult = {
  tradersChecked: number;
  newTrades: number;
  newSignals: number;
};

/**
 * For each tracked trader, diff positions/history against lastSyncedPositionId.
 * - New CLOSED position (active=false) → insert as a `trade` row (real realized PnL).
 * - New OPEN  position (active=true)  → insert as a `signal` row (entry alert).
 * Drives the social feed AND the copy-trading automation triggers.
 */
export async function runSignalPollerOnce(): Promise<PollerResult> {
  const traders = await db.select().from(tradersTable).where(
    and(eq(tradersTable.isAutoDiscovered, true), isNotNull(tradersTable.walletAddress)),
  );

  const result: PollerResult = { tradersChecked: 0, newTrades: 0, newSignals: 0 };

  for (const trader of traders) {
    if (!trader.walletAddress) continue;
    result.tradersChecked++;

    let positions: SodexPosition[];
    try {
      positions = await fetchPositions(trader.walletAddress, 30);
    } catch (err) {
      logger.warn({ event: "poller.positions_fail", trader: trader.username, err: String(err) }, "positions fetch failed");
      continue;
    }

    const lastId = trader.lastSyncedPositionId ? parseInt(trader.lastSyncedPositionId, 10) : 0;
    const newPositions = positions.filter(p => p.id > lastId);
    if (newPositions.length === 0) continue;

    let newHigh = lastId;

    for (const p of newPositions) {
      if (p.id > newHigh) newHigh = p.id;
      const symbol = uiSymbol(p.symbol);
      const side = p.positionSide;
      const isClosed = !p.active && parseFloat(p.cumClosedSize || "0") > 0;
      const isOpen = p.active && parseFloat(p.size || "0") > 0;

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
            closedAt: new Date(p.updatedAt),
          }).onConflictDoNothing({ target: [tradesTable.traderId, tradesTable.sodexTradeId] }).returning();
          if (inserted.length > 0) {
            result.newTrades++;
            logger.info({ event: "poller.new_trade", trader: trader.username, symbol, pnl, sodexId: p.id }, "imported new closed trade");
          }
        } else if (isOpen) {
          const entry = parseFloat(p.avgEntryPrice);
          const targetPct = side === "LONG" ? 1.05 : 0.95;
          const stopPct   = side === "LONG" ? 0.97 : 1.03;
          const inserted = await db.insert(signalsTable).values({
            traderId: trader.id,
            asset: symbol,
            side,
            entryPrice: entry.toFixed(8),
            targetPrice: (entry * targetPct).toFixed(8),
            stopLoss: (entry * stopPct).toFixed(8),
            confidence: 75,
            reasoning: `Live entry detected from ${trader.username} on Sodex perps · ${p.leverage}x ${p.marginMode}`,
            status: "open",
            isActive: true,
            sodexPositionId: String(p.id),
          }).onConflictDoNothing({ target: [signalsTable.traderId, signalsTable.sodexPositionId] }).returning();
          if (inserted.length > 0) result.newSignals++;
          logger.info({ event: "poller.new_signal", trader: trader.username, symbol, side, entry, sodexId: p.id }, "imported new open position as signal");
        }
      } catch (err) {
        logger.warn({ event: "poller.insert_fail", trader: trader.username, sodexId: p.id, err: String(err) }, "insert failed");
      }
    }

    if (newHigh > lastId) {
      await db.update(tradersTable).set({
        lastSyncedPositionId: String(newHigh),
        lastSyncedAt: new Date(),
      }).where(eq(tradersTable.id, trader.id));
    }
  }

  if (result.newTrades > 0 || result.newSignals > 0) {
    logger.info({ event: "poller.done", ...result }, "signal poller cycle complete");
  }
  return result;
}

let _pollerInterval: NodeJS.Timeout | null = null;

export function startSignalPoller(intervalMs = 60_000) {
  if (_pollerInterval) return;
  setTimeout(() => { runSignalPollerOnce().catch(err => logger.error({ err }, "initial poller run failed")); }, 30_000);
  _pollerInterval = setInterval(() => {
    runSignalPollerOnce().catch(err => logger.error({ err }, "scheduled poller run failed"));
  }, intervalMs);
  logger.info({ event: "poller.started", intervalMs }, "signal poller started");
}
