import { Router, type IRouter } from "express";
import { db, signalsTable, tradersTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { LikeSignalParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/signals", async (req, res) => {
  const { asset, side, status, minConfidence, traderId, limit = 20, offset = 0 } = req.query;

  const filters = [];
  if (asset) filters.push(eq(signalsTable.asset, String(asset)));
  if (side === "LONG" || side === "SHORT") filters.push(eq(signalsTable.side, side));
  if (status === "open" || status === "hit" || status === "stopped") {
    filters.push(eq(signalsTable.status, status));
  }
  if (minConfidence) filters.push(gte(signalsTable.confidence, Number(minConfidence)));
  if (traderId) filters.push(eq(signalsTable.traderId, Number(traderId)));

  const rows = await db
    .select({
      signal: signalsTable,
      trader: tradersTable,
    })
    .from(signalsTable)
    .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(sql`${signalsTable.createdAt} desc`)
    .limit(Number(limit))
    .offset(Number(offset));

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(signalsTable)
    .where(filters.length > 0 ? and(...filters) : undefined);

  res.json({
    signals: rows.map(({ signal, trader }) => ({
      id: signal.id,
      traderId: signal.traderId,
      traderUsername: trader.username,
      traderHandle: trader.handle,
      traderRepScore: Number(trader.repScore),
      traderTier: trader.tier,
      asset: signal.asset,
      side: signal.side,
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopLoss: signal.stopLoss,
      confidence: signal.confidence,
      reasoning: signal.reasoning ?? "",
      status: signal.status,
      likeCount: signal.likeCount,
      isActive: signal.isActive,
      createdAt: signal.createdAt.toISOString(),
    })),
    total,
  });
});

router.post("/signals", async (req, res) => {
  const { traderId, asset, side, entryPrice, targetPrice, stopLoss, confidence, reasoning, status } = req.body;
  if (!traderId || !asset || !side || !entryPrice || !targetPrice || !stopLoss) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [signal] = await db.insert(signalsTable).values({
    traderId,
    asset,
    side,
    entryPrice: String(entryPrice),
    targetPrice: String(targetPrice),
    stopLoss: String(stopLoss),
    confidence: confidence ?? 70,
    reasoning,
    status: status ?? "open",
  }).returning();
  res.status(201).json(signal);
});

router.post("/signals/:signalId/like", async (req, res) => {
  const parsed = LikeSignalParams.safeParse({ signalId: Number(req.params.signalId) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(signalsTable)
    .set({ likeCount: sql`${signalsTable.likeCount} + 1` })
    .where(eq(signalsTable.id, parsed.data.signalId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }
  res.json({ likeCount: updated.likeCount });
});

export default router;
