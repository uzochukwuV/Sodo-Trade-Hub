import { Router, type IRouter } from "express";
import { db, signalsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateSignalBody, LikeSignalParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/signals", async (req, res) => {
  const parsed = CreateSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [signal] = await db.insert(signalsTable).values({
    traderId: data.traderId,
    asset: data.asset,
    side: data.side,
    entryPrice: String(data.entryPrice),
    targetPrice: String(data.targetPrice),
    stopLoss: String(data.stopLoss),
    confidence: data.confidence ?? 70,
    reasoning: data.reasoning,
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
