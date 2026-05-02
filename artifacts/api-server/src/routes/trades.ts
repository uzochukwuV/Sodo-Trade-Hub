import { Router, type IRouter } from "express";
import { db, tradesTable, tradersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { LikeTradeParams } from "@workspace/api-zod";
import { fireRepEvent, recomputeRepScore } from "../lib/reputation";

const router: IRouter = Router();

router.post("/trades", async (req, res) => {
  const { traderId, asset, side, entryPrice, exitPrice, pnlUsd, pnlPct,
          positionSize, leverage, isVerified, comment } = req.body;

  if (!traderId || !asset || !side || entryPrice === undefined || exitPrice === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [trade] = await db.insert(tradesTable).values({
    traderId: Number(traderId),
    asset,
    side,
    entryPrice: String(entryPrice),
    exitPrice: String(exitPrice),
    pnlUsd: String(pnlUsd ?? 0),
    pnlPct: String(pnlPct ?? 0),
    positionSize: String(positionSize ?? 0),
    leverage: Number(leverage ?? 1),
    isVerified: Boolean(isVerified ?? false),
    comment: comment ?? null,
  }).returning();

  const pnlNum = Number(pnlUsd ?? 0);
  const isWin = pnlNum >= 0;

  await db.update(tradersTable)
    .set({
      tradeCount: sql`${tradersTable.tradeCount} + 1`,
      totalPnlUsd: sql`${tradersTable.totalPnlUsd} + ${pnlNum}`,
      winRate: sql`
        ROUND(
          (SELECT COUNT(*)::numeric FROM trades WHERE trader_id = ${Number(traderId)} AND pnl_usd::numeric >= 0)
          / NULLIF((SELECT COUNT(*) FROM trades WHERE trader_id = ${Number(traderId)}), 0) * 100,
          2
        )
      `,
    })
    .where(eq(tradersTable.id, Number(traderId)));

  await fireRepEvent(
    Number(traderId),
    isWin ? "trade_win" : "trade_loss",
    isWin ? 0.5 : -0.3,
    trade.id,
    "trade",
    `${asset} ${side} ${pnlNum >= 0 ? "+" : ""}${pnlNum}`
  );

  await recomputeRepScore(Number(traderId));

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
