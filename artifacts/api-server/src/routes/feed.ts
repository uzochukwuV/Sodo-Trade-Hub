import { Router, type IRouter } from "express";
import { db, tradersTable, tradesTable, signalsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { GetFeedQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/feed", async (req, res) => {
  const parsed = GetFeedQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { filter, limit, offset } = parsed.data;

  const items: unknown[] = [];

  if (filter === "all" || filter === "wins") {
    const trades = await db
      .select({
        trade: tradesTable,
        trader: tradersTable,
      })
      .from(tradesTable)
      .innerJoin(tradersTable, eq(tradesTable.traderId, tradersTable.id))
      .where(filter === "wins" ? and(eq(tradesTable.isVerified, true)) : undefined)
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
          asset: trade.asset,
          side: trade.side,
          entryPrice: Number(trade.entryPrice),
          exitPrice: Number(trade.exitPrice),
          pnlUsd: trade.pnlUsd,
          pnlPct: trade.pnlPct,
          positionSize: trade.positionSize,
          leverage: trade.leverage,
          isVerified: trade.isVerified,
          likeCount: trade.likeCount,
          comment: trade.comment ?? undefined,
          closedAt: trade.closedAt.toISOString(),
          createdAt: trade.createdAt.toISOString(),
        },
        signal: null,
        timestamp: trade.createdAt.toISOString(),
      });
    }
  }

  if (filter === "all" || filter === "signals") {
    const signals = await db
      .select({
        signal: signalsTable,
        trader: tradersTable,
      })
      .from(signalsTable)
      .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
      .orderBy(desc(signalsTable.createdAt))
      .limit(filter === "all" ? Math.floor(limit / 2) : limit)
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
        timestamp: signal.createdAt.toISOString(),
      });
    }
  }

  items.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({ items: items.slice(0, limit), total: items.length, hasMore: items.length >= limit });
});

export default router;
