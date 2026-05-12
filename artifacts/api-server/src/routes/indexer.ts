import { Router, type IRouter } from "express";
import { runTrackerOnce, getIndexerStatus } from "../services/leaderboard-tracker";
import { runSignalPollerOnce } from "../services/signal-poller";
import { db, tradersTable } from "@workspace/db";
import { eq, desc, count, and, isNotNull } from "drizzle-orm";
import { getWsHealth } from "../services/sodex-ws";

const router: IRouter = Router();

router.get("/indexer/status", async (_req, res) => {
  const state = await getIndexerStatus();
  const [{ value: tracked }] = await db.select({ value: count() })
    .from(tradersTable)
    .where(and(eq(tradersTable.isAutoDiscovered, true), isNotNull(tradersTable.walletAddress)));
  const ws = getWsHealth();
  res.json({
    lastBlock: state.lastBlock,
    walletsDiscovered: state.walletsDiscovered,
    lastRunAt: state.lastRunAt,
    isRunning: state.isRunning,
    lastError: state.lastError,
    totalAutoDiscovered: Number(tracked),
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
    const window = (req.body?.window as "24H" | "7D" | "30D" | "ALL_TIME") ?? "ALL_TIME";
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 50, 10), 50);
    const result = await runTrackerOnce({ window, pageSize });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/indexer/poll", async (_req, res) => {
  try {
    const result = await runSignalPollerOnce();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/indexer/discovered", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const traders = await db.select().from(tradersTable)
    .where(eq(tradersTable.isAutoDiscovered, true))
    .orderBy(desc(tradersTable.totalPnlUsd))
    .limit(limit);
  res.json({ traders });
});

export default router;
