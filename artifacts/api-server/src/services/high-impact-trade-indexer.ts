import { db, tradesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getLiveHighImpactTrades, type LiveHighImpactTrade } from "./live-sodex-intel";

const DEFAULT_MIN_PROFIT_USD = 500;
const DEFAULT_MIN_LOSS_USD = 500;

function tradeComment(trade: LiveHighImpactTrade) {
  const pnl = Math.abs(trade.pnlUsd).toFixed(0);
  if (trade.pnlUsd >= 0) {
    return `High-impact profit: ${trade.side} ${trade.symbol} ${trade.leverage}x for +$${pnl}`;
  }
  return `High-impact loss: ${trade.side} ${trade.symbol} ${trade.leverage}x for -$${pnl}`;
}

export async function runHighImpactTradeIndexerOnce(opts: {
  window?: "24H" | "7D" | "30D" | "ALL_TIME";
  leaderboardSize?: number;
  limit?: number;
  minProfitUsd?: number;
  minLossUsd?: number;
  positionLimit?: number;
} = {}) {
  const result = await getLiveHighImpactTrades({
    window: opts.window ?? "7D",
    leaderboardSize: opts.leaderboardSize ?? 20,
    limit: opts.limit ?? 100,
    minProfitUsd: opts.minProfitUsd ?? DEFAULT_MIN_PROFIT_USD,
    minLossUsd: opts.minLossUsd ?? DEFAULT_MIN_LOSS_USD,
    positionLimit: opts.positionLimit ?? 100,
  });

  let inserted = 0;
  for (const trade of result.items) {
    try {
      const rows = await db.insert(tradesTable).values({
        traderId: null,
        walletAddress: trade.walletAddress,
        accountId: trade.accountId,
        leaderboardRank: trade.rank,
        leaderboardWindow: trade.windowType,
        asset: trade.symbol,
        side: trade.side as "LONG" | "SHORT",
        entryPrice: String(trade.entryPrice ?? 0),
        exitPrice: String(trade.exitPrice ?? 0),
        pnlUsd: trade.pnlUsd.toFixed(2),
        pnlPct: (trade.pnlPct ?? 0).toFixed(4),
        positionSize: (trade.notionalUsd ?? 0).toFixed(4),
        leverage: trade.leverage,
        isVerified: true,
        isOnChainVerified: true,
        sodexTradeId: trade.sodexPositionId,
        comment: tradeComment(trade),
        openedAt: trade.openedAt ? new Date(trade.openedAt) : null,
        closedAt: trade.closedAt ? new Date(trade.closedAt) : new Date(),
      }).onConflictDoNothing({ target: [tradesTable.walletAddress, tradesTable.sodexTradeId] }).returning();

      if (rows.length > 0) inserted++;
    } catch (err) {
      logger.warn({
        event: "high_impact_trade_indexer.insert_fail",
        wallet: trade.walletAddress,
        sodexTradeId: trade.sodexPositionId,
        err: String(err),
      }, "high-impact trade insert failed");
    }
  }

  logger.info({
    event: "high_impact_trade_indexer.done",
    scannedWallets: result.scannedWallets,
    fetched: result.items.length,
    inserted,
    window: result.window,
    thresholds: result.thresholds,
  }, "high-impact trade indexer cycle complete");

  return {
    scannedWallets: result.scannedWallets,
    fetched: result.items.length,
    inserted,
    window: result.window,
    thresholds: result.thresholds,
  };
}

let interval: NodeJS.Timeout | null = null;

export function startHighImpactTradeIndexer(intervalMs = 60_000) {
  if (interval) return;
  runHighImpactTradeIndexerOnce().catch(err =>
    logger.error({ err }, "initial high-impact trade indexer run failed"),
  );
  interval = setInterval(() => {
    runHighImpactTradeIndexerOnce().catch(err =>
      logger.error({ err }, "scheduled high-impact trade indexer run failed"),
    );
  }, intervalMs);
  logger.info({ event: "high_impact_trade_indexer.started", intervalMs }, "high-impact trade indexer started");
}
