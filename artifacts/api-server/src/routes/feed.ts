import { Router, type IRouter } from "express";
import { db, tradersTable, tradesTable, signalsTable, painRoomsTable } from "@workspace/db";
import { eq, desc, and, lt } from "drizzle-orm";
import { nonEliteTraderSqlPredicate } from "../services/trader-classification";

const router: IRouter = Router();

function formatTimeAgo(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

router.get("/feed", async (req, res) => {
  const filter = String(req.query.filter ?? "all");
  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);

  if (!["all", "wins", "signals", "losses", "whales"].includes(filter)) {
    res.status(400).json({ error: "Invalid filter" });
    return;
  }

  const items: unknown[] = [];

  if (filter === "all" || filter === "wins") {
    const winFilter = filter === "wins" ? and(eq(tradesTable.isVerified, true)) : undefined;
    // Over-fetch so we have room to diversify across traders below.
    const targetTrades = filter === "all" ? Math.ceil(limit / 2) : limit;
    const trades = await db
      .select({ trade: tradesTable, trader: tradersTable })
      .from(tradesTable)
      .innerJoin(tradersTable, eq(tradesTable.traderId, tradersTable.id))
      .where(winFilter)
      .orderBy(desc(tradesTable.closedAt))
      .limit(targetTrades * 8)
      .offset(offset);

    // Cap each trader at 2 trades so a single hyperactive wallet
    // (e.g. an HFT bot) cannot monopolize the feed.
    const PER_TRADER_CAP = 2;
    const perTrader = new Map<number, number>();
    const diversified: typeof trades = [];
    for (const row of trades) {
      const c = perTrader.get(row.trader.id) ?? 0;
      if (c >= PER_TRADER_CAP) continue;
      perTrader.set(row.trader.id, c + 1);
      diversified.push(row);
      if (diversified.length >= targetTrades) break;
    }

    for (const { trade, trader } of diversified) {
      items.push({
        type: "trade",
        trade: {
          id: trade.id,
          traderId: trader.id,
          traderUsername: trader.username,
          traderHandle: trader.handle,
          traderRepScore: Number(trader.repScore),
          traderTier: trader.tier,
          traderWalletAddress: trader.walletAddress ?? undefined,
          traderIsAutoDiscovered: trader.isAutoDiscovered,
          asset: trade.asset,
          side: trade.side,
          entryPrice: Number(trade.entryPrice),
          exitPrice: Number(trade.exitPrice),
          pnlUsd: trade.pnlUsd,
          pnlPct: trade.pnlPct,
          positionSize: trade.positionSize,
          leverage: trade.leverage,
          isOnChainVerified: trade.isOnChainVerified ?? false,
          isVerified: trade.isVerified,
          txHash: trade.txHash ?? undefined,
          likeCount: trade.likeCount,
          likes: trade.likeCount,
          caption: trade.comment ?? undefined,
          comment: trade.comment ?? undefined,
          closedAt: trade.closedAt.toISOString(),
          createdAt: trade.createdAt.toISOString(),
        },
        signal: null,
        loss: null,
        whale: null,
        timestamp: trade.closedAt.toISOString(),
      });
    }
  }

  if (filter === "all" || filter === "signals") {
    // Only non-elite traders' signals appear in the Feed (tagged
    // "moderate_signal"). Elite signals are routed exclusively to the
    // Signals page so the Feed stays a "social/discovery" surface.
    const signals = await db
      .select({ signal: signalsTable, trader: tradersTable })
      .from(signalsTable)
      .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
      .where(and(eq(signalsTable.status, "open"), nonEliteTraderSqlPredicate()))
      .orderBy(desc(signalsTable.createdAt))
      .limit(filter === "all" ? Math.floor(limit / 3) : limit)
      .offset(offset);

    for (const { signal, trader } of signals) {
      const signalPayload = {
        id: signal.id,
        traderId: trader.id,
        traderUsername: trader.username,
        traderHandle: trader.handle,
        traderRepScore: Number(trader.repScore),
        traderTier: trader.tier,
        traderSignalAccuracy: Number(trader.signalAccuracy),
        traderStreakDays: trader.streakDays,
        traderWalletAddress: trader.walletAddress ?? undefined,
        traderIsAutoDiscovered: trader.isAutoDiscovered,
        txHash: signal.txHash ?? undefined,
        sodexPositionId: signal.sodexPositionId ?? undefined,
        asset: signal.asset,
        side: signal.side,
        entryPrice: Number(signal.entryPrice),
        targetPrice: Number(signal.targetPrice),
        stopLoss: Number(signal.stopLoss),
        confidence: signal.confidence,
        reasoning: signal.reasoning ?? undefined,
        status: signal.status,
        isActive: signal.isActive,
        likeCount: signal.likeCount,
        createdAt: signal.createdAt.toISOString(),
      };
      items.push({
        type: "moderate_signal",
        trade: null,
        signal: signalPayload,
        moderateSignal: signalPayload,
        loss: null,
        whale: null,
        timestamp: signal.createdAt.toISOString(),
      });
    }
  }

  if (filter === "all" || filter === "losses") {
    const losses = await db
      .select({ pr: painRoomsTable, trader: tradersTable })
      .from(painRoomsTable)
      .innerJoin(tradersTable, eq(painRoomsTable.traderId, tradersTable.id))
      .where(lt(painRoomsTable.pnlUsd, "0"))
      .orderBy(desc(painRoomsTable.createdAt))
      .limit(filter === "all" ? Math.floor(limit / 4) : limit)
      .offset(offset);

    for (const { pr, trader } of losses) {
      items.push({
        type: "loss",
        trade: null,
        signal: null,
        loss: {
          id: pr.id,
          traderId: pr.traderId,
          traderUsername: pr.isAnonymous ? "Anonymous" : trader.username,
          traderHandle: pr.isAnonymous ? "anon" : trader.handle,
          traderRepScore: pr.isAnonymous ? 0 : Number(trader.repScore),
          traderTier: pr.isAnonymous ? "SILVER" : trader.tier,
          traderWalletAddress: pr.isAnonymous ? undefined : (trader.walletAddress ?? undefined),
          isAnonymous: pr.isAnonymous,
          asset: pr.asset,
          side: pr.side,
          pnlUsd: pr.pnlUsd,
          pnlPct: pr.pnlPct,
          leverage: pr.leverage,
          comment: pr.comment ?? null,
          breakdownCount: pr.breakdownCount,
          isResolved: pr.isResolved,
          createdAt: pr.createdAt.toISOString(),
        },
        whale: null,
        timestamp: pr.createdAt.toISOString(),
      });
    }
  }

  if (filter === "all" || filter === "whales") {
    // "Whale" posts surface real, large notional closed trades from tracked Sodex wallets.
    // No fabricated data — just trades whose positionSize ≥ $250k notional.
    const whaleTrades = await db
      .select({ trade: tradesTable, trader: tradersTable })
      .from(tradesTable)
      .innerJoin(tradersTable, eq(tradesTable.traderId, tradersTable.id))
      .orderBy(desc(tradesTable.positionSize))
      .limit(filter === "all" ? Math.floor(limit / 5) : limit);

    for (const { trade, trader } of whaleTrades) {
      const notional = Number(trade.positionSize);
      if (notional < 250_000) continue;
      items.push({
        type: "whale",
        trade: null,
        signal: null,
        loss: null,
        whale: {
          traderId: trader.id,
          traderUsername: trader.username,
          traderHandle: trader.handle,
          traderWalletAddress: trader.walletAddress ?? undefined,
          repScore: Number(trader.repScore),
          pair: trade.asset,
          side: trade.side,
          positionSizeUsd: notional.toFixed(0),
          leverage: String(trade.leverage),
          timeAgo: formatTimeAgo(Date.now() - trade.closedAt.getTime()),
          tradeId: trade.id,
          pnlUsd: trade.pnlUsd,
        },
        timestamp: trade.closedAt.toISOString(),
      });
    }
  }

  items.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({ items: items.slice(0, limit), total: items.length, hasMore: items.length >= limit });
});

export default router;
