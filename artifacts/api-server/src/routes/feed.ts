import { Router, type IRouter } from "express";
import { db, tradersTable, tradesTable, signalsTable, painRoomsTable } from "@workspace/db";
import { eq, desc, and, lt } from "drizzle-orm";

const router: IRouter = Router();

function formatTimeAgo(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const WHALE_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "AVAX/USDT"];

function generateWhales(traders: typeof tradersTable.$inferSelect[]) {
  return WHALE_PAIRS.flatMap((pair) => {
    const longT = traders[Math.floor(Math.random() * traders.length)];
    const shortT = traders[Math.floor(Math.random() * traders.length)];
    const base = Date.now();
    return [
      {
        traderId: longT.id,
        traderUsername: longT.username,
        traderHandle: longT.handle,
        traderWalletAddress: longT.walletAddress ?? undefined,
        repScore: Number(longT.repScore),
        pair,
        side: "LONG" as const,
        positionSizeUsd: (Math.random() * 9000000 + 1000000).toFixed(0),
        leverage: String(Math.floor(Math.random() * 20) + 1),
        timeAgo: formatTimeAgo(base - Math.random() * 86400000),
      },
      {
        traderId: shortT.id,
        traderUsername: shortT.username,
        traderHandle: shortT.handle,
        traderWalletAddress: shortT.walletAddress ?? undefined,
        repScore: Number(shortT.repScore),
        pair,
        side: "SHORT" as const,
        positionSizeUsd: (Math.random() * 5000000 + 500000).toFixed(0),
        leverage: String(Math.floor(Math.random() * 10) + 1),
        timeAgo: formatTimeAgo(base - Math.random() * 86400000),
      },
    ];
  });
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
    const trades = await db
      .select({ trade: tradesTable, trader: tradersTable })
      .from(tradesTable)
      .innerJoin(tradersTable, eq(tradesTable.traderId, tradersTable.id))
      .where(winFilter)
      .orderBy(desc(tradesTable.createdAt))
      .limit(filter === "all" ? Math.ceil(limit / 2) : limit)
      .offset(offset);

    for (const { trade, trader } of trades) {
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
        timestamp: trade.createdAt.toISOString(),
      });
    }
  }

  if (filter === "all" || filter === "signals") {
    const signals = await db
      .select({ signal: signalsTable, trader: tradersTable })
      .from(signalsTable)
      .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
      .orderBy(desc(signalsTable.createdAt))
      .limit(filter === "all" ? Math.floor(limit / 3) : limit)
      .offset(offset);

    for (const { signal, trader } of signals) {
      items.push({
        type: "signal",
        trade: null,
        signal: {
          id: signal.id,
          traderId: trader.id,
          traderUsername: trader.username,
          traderHandle: trader.handle,
          traderRepScore: Number(trader.repScore),
          traderTier: trader.tier,
          traderWalletAddress: trader.walletAddress ?? undefined,
          traderIsAutoDiscovered: trader.isAutoDiscovered,
          txHash: signal.txHash ?? undefined,
          asset: signal.asset,
          side: signal.side,
          entryPrice: Number(signal.entryPrice),
          targetPrice: Number(signal.targetPrice),
          stopLoss: Number(signal.stopLoss),
          confidence: signal.confidence,
          reasoning: signal.reasoning ?? undefined,
          isActive: signal.isActive,
          likeCount: signal.likeCount,
          createdAt: signal.createdAt.toISOString(),
        },
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
    const allTraders = await db.select().from(tradersTable).limit(20);
    if (allTraders.length > 0) {
      const whales = generateWhales(allTraders);
      const sliceCount = filter === "all" ? Math.floor(limit / 5) : limit;
      for (const whale of whales.slice(0, sliceCount)) {
        const fakeTs = new Date(Date.now() - Math.random() * 86400000).toISOString();
        items.push({
          type: "whale",
          trade: null,
          signal: null,
          loss: null,
          whale,
          timestamp: fakeTs,
        });
      }
    }
  }

  items.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({ items: items.slice(0, limit), total: items.length, hasMore: items.length >= limit });
});

export default router;
