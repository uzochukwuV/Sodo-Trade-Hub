import { Router, type IRouter } from "express";
import { runHighImpactTradeIndexerOnce } from "../services/high-impact-trade-indexer";
import { db, tradesTable } from "@workspace/db";
import { desc, count, isNotNull } from "drizzle-orm";
import { getWsHealth } from "../services/sodex-ws";

const router: IRouter = Router();

router.get("/indexer/status", async (_req, res) => {
  const [{ value: highImpactTrades }] = await db.select({ value: count() })
    .from(tradesTable)
    .where(isNotNull(tradesTable.walletAddress));
  const ws = getWsHealth();
  res.json({
    mode: "high-impact-trades-only",
    highImpactTrades: Number(highImpactTrades),
    ws: {
      connected: ws.connected,
      lastMessageAt: ws.lastMessageAt ? new Date(ws.lastMessageAt).toISOString() : null,
      lastConnectedAt: ws.lastConnectedAt ? new Date(ws.lastConnectedAt).toISOString() : null,
      subscriptionCount: ws.subscriptionCount,
      reconnectCount: ws.reconnectCount,
      lastError: ws.lastError,
    },
  });
});

router.post("/indexer/run", async (req, res) => {
  try {
    const window = (req.body?.window as "24H" | "7D" | "30D" | "ALL_TIME") ?? "7D";
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 50, 10), 50);
    const result = await runHighImpactTradeIndexerOnce({
      window,
      leaderboardSize: pageSize,
      limit: Math.min(Math.max(Number(req.body?.limit) || 100, 1), 100),
      minProfitUsd: Math.max(Number(req.body?.minProfitUsd) || 500, 0),
      minLossUsd: Math.max(Number(req.body?.minLossUsd) || 500, 0),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/indexer/poll", async (_req, res) => {
  try {
    res.status(410).json({ error: "stored trader/signal poller disabled; use /indexer/run for high-impact trades" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/indexer/discovered", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const trades = await db.select().from(tradesTable)
    .where(isNotNull(tradesTable.walletAddress))
    .orderBy(desc(tradesTable.closedAt))
    .limit(limit);
  res.json({ trades });
});

export default router;
