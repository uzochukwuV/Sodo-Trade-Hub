import { Router, type IRouter } from "express";
import { runIndexerOnce, getIndexerStatus } from "../services/indexer";
import { db, tradersTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/indexer/status", async (_req, res) => {
  const state = await getIndexerStatus();
  const [{ value: discoveredCount }] = await db.select({ value: count() })
    .from(tradersTable).where(eq(tradersTable.isAutoDiscovered, true));
  res.json({
    lastBlock: state.lastBlock,
    walletsDiscovered: state.walletsDiscovered,
    lastRunAt: state.lastRunAt,
    isRunning: state.isRunning,
    lastError: state.lastError,
    totalAutoDiscovered: Number(discoveredCount),
  });
});

router.post("/indexer/run", async (_req, res) => {
  try {
    const result = await runIndexerOnce();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/indexer/discovered", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const traders = await db.select().from(tradersTable)
    .where(eq(tradersTable.isAutoDiscovered, true))
    .orderBy(desc(tradersTable.repScore))
    .limit(limit);
  res.json({ traders });
});

export default router;
