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

const WHALE_TRADERS = [
  { username: "CryptoWhale99", handle: "cryptowhale99", repScore: 94.5, id: 1 },
  { username: "SolanaKing", handle: "solanaking", repScore: 87.2, id: 2 },
  { username: "EthDegenX", handle: "ethdegen_x", repScore: 81.0, id: 3 },
  { username: "ArbArbitrage", handle: "arb_arb", repScore: 76.4, id: 4 },
  { username: "BNBBull", handle: "bnbbull", repScore: 69.1, id: 5 },
];

function randomWhaleTrader() {
  return WHALE_TRADERS[Math.floor(Math.random() * WHALE_TRADERS.length)];
}

function formatTimeAgo(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

router.get("/analytics/whales", async (_req, res) => {
  const pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ARB/USDT"];
  const whales = pairs.flatMap(pair => {
    const longTrader = randomWhaleTrader();
    const shortTrader = randomWhaleTrader();
    const longAgo = Math.random() * 86400000;
    const shortAgo = Math.random() * 86400000;
    return [
      {
        traderId: longTrader.id,
        traderUsername: longTrader.username,
        traderHandle: longTrader.handle,
        repScore: longTrader.repScore,
        pair,
        side: "LONG" as const,
        positionSizeUsd: (Math.random() * 10000000 + 500000).toFixed(0),
        leverage: String(Math.floor(Math.random() * 20) + 1),
        timeAgo: formatTimeAgo(longAgo),
      },
      {
        traderId: shortTrader.id,
        traderUsername: shortTrader.username,
        traderHandle: shortTrader.handle,
        repScore: shortTrader.repScore,
        pair,
        side: "SHORT" as const,
        positionSizeUsd: (Math.random() * 5000000 + 200000).toFixed(0),
        leverage: String(Math.floor(Math.random() * 10) + 1),
        timeAgo: formatTimeAgo(shortAgo),
      },
    ];
  });
  res.json({ whales });
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
    id: t.id,
    username: t.username,
    handle: t.handle,
    repScore: Number(t.repScore),
    tier: t.tier,
    totalPnlUsd: t.totalPnlUsd,
    winRate: Number(t.winRate),
    tradeCount: t.tradeCount,
    followerCount: t.followerCount,
    period,
  }));

  res.json({ traders: entries, total: entries.length, period });
});

export default router;
