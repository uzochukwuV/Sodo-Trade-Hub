import { Router, type IRouter } from "express";
import { db, tradersTable, tradesTable } from "@workspace/db";
import { desc, avg, count, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics/summary", async (req, res) => {
  const [stats] = await db.select({
    totalTraders: count(tradersTable.id),
    avgRepScore: avg(tradersTable.repScore),
    avgWinRate: avg(tradersTable.winRate),
  }).from(tradersTable);

  const [tradeStats] = await db.select({
    totalTrades: count(tradesTable.id),
    totalVolume: sql<string>`coalesce(sum(${tradesTable.positionSize}::numeric), 0)`,
    totalPnl: sql<string>`coalesce(sum(${tradesTable.pnlUsd}::numeric), 0)`,
  }).from(tradesTable);

  const topTraders = await db.select().from(tradersTable)
    .orderBy(desc(tradersTable.totalPnlUsd))
    .limit(5);

  const pairVolumes = await db.select({
    pair: tradesTable.asset,
    volume: sql<string>`sum(${tradesTable.positionSize}::numeric)`,
    longPct: sql<number>`round(100.0 * sum(case when ${tradesTable.side} = 'LONG' then 1 else 0 end) / count(*), 1)`,
    shortPct: sql<number>`round(100.0 * sum(case when ${tradesTable.side} = 'SHORT' then 1 else 0 end) / count(*), 1)`,
  })
    .from(tradesTable)
    .groupBy(tradesTable.asset)
    .orderBy(sql`sum(${tradesTable.positionSize}::numeric) desc`)
    .limit(6);

  res.json({
    totalTraders: Number(stats?.totalTraders ?? 0),
    avgRepScore: Number(stats?.avgRepScore ?? 0),
    avgWinRate: Number(stats?.avgWinRate ?? 0),
    totalTrades: Number(tradeStats?.totalTrades ?? 0),
    totalVolume: tradeStats?.totalVolume ?? "0",
    totalPnl: tradeStats?.totalPnl ?? "0",
    topTraders,
    pairAnalytics: pairVolumes.map(p => ({
      pair: p.pair,
      volume: p.volume,
      longPct: Number(p.longPct),
      shortPct: Number(p.shortPct),
    })),
  });
});

router.get("/analytics/market-prices", async (_req, res) => {
  const assets = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ARB/USDT", "OP/USDT"];
  const prices = assets.map(symbol => ({
    symbol,
    price: (Math.random() * 70000 + 100).toFixed(2),
    change24h: ((Math.random() - 0.5) * 10).toFixed(2),
    volume24h: (Math.random() * 1e9).toFixed(0),
  }));
  res.json({ prices });
});

router.get("/analytics/whale-activity", async (_req, res) => {
  const assets = ["BTC", "ETH", "SOL", "BNB", "ARB"];
  const positions = assets.flatMap(asset => [
    {
      asset,
      side: "LONG" as const,
      size: (Math.random() * 10000000).toFixed(0),
      leverage: Math.floor(Math.random() * 20) + 1,
      trader: `whale_${Math.floor(Math.random() * 999)}`,
      openedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    },
    {
      asset,
      side: "SHORT" as const,
      size: (Math.random() * 5000000).toFixed(0),
      leverage: Math.floor(Math.random() * 10) + 1,
      trader: `whale_${Math.floor(Math.random() * 999)}`,
      openedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    },
  ]);
  res.json({ positions });
});

router.get("/leaderboard", async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;
  const period = (req.query.period as string) || "all";

  const traders = await db.select().from(tradersTable)
    .orderBy(desc(tradersTable.totalPnlUsd))
    .limit(limit)
    .offset(offset);

  const entries = traders.map((t, i) => ({
    rank: offset + i + 1,
    trader: {
      id: t.id,
      username: t.username,
      handle: t.handle,
      avatarUrl: t.avatarUrl,
      repScore: Number(t.repScore),
      tier: t.tier,
      totalPnlUsd: t.totalPnlUsd,
      winRate: Number(t.winRate),
      tradeCount: t.tradeCount,
      followerCount: t.followerCount,
    },
    pnlUsd: t.totalPnlUsd,
    winRate: Number(t.winRate),
    tradeCount: t.tradeCount,
    period,
  }));

  res.json({ entries, total: entries.length, period });
});

export default router;
