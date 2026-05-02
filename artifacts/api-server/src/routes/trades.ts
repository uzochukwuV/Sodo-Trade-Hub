import { Router, type IRouter } from "express";
import { db, tradesTable, tradersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateTradeBody, LikeTradeParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/trades", async (req, res) => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [trade] = await db.insert(tradesTable).values({
    traderId: data.traderId,
    asset: data.asset,
    side: data.side,
    entryPrice: String(data.entryPrice),
    exitPrice: String(data.exitPrice),
    pnlUsd: String(data.pnlUsd),
    pnlPct: String(data.pnlPct),
    positionSize: String(data.positionSize),
    leverage: data.leverage ?? 1,
    isVerified: data.isVerified ?? false,
    comment: data.comment,
  }).returning();

  const pnlNum = Number(data.pnlUsd);
  await db.update(tradersTable)
    .set({
      tradeCount: sql`${tradersTable.tradeCount} + 1`,
      totalPnlUsd: sql`${tradersTable.totalPnlUsd} + ${pnlNum}`,
    })
    .where(eq(tradersTable.id, data.traderId));

  res.status(201).json(trade);
});

router.post("/trades/:tradeId/like", async (req, res) => {
  const parsed = LikeTradeParams.safeParse({ tradeId: Number(req.params.tradeId) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(tradesTable)
    .set({ likeCount: sql`${tradesTable.likeCount} + 1` })
    .where(eq(tradesTable.id, parsed.data.tradeId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json({ likeCount: updated.likeCount });
});

export default router;
