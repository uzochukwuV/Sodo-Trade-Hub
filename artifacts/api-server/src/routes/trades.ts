import { Router, type IRouter } from "express";
import { db, tradesTable, tradersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { LikeTradeParams } from "@workspace/api-zod";
import { fireRepEvent, recomputeRepScore } from "../lib/reputation";
import { verifySodexTrade } from "../services/market";

const router: IRouter = Router();

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

router.post("/trades/verify-sodex", async (req, res) => {
  const { symbol, sodexTradeId, side, claimedPrice } = req.body;

  if (!symbol || !sodexTradeId || !side || claimedPrice === undefined) {
    res.status(400).json({ error: "Missing required fields: symbol, sodexTradeId, side, claimedPrice" });
    return;
  }
  if (side !== "LONG" && side !== "SHORT") {
    res.status(400).json({ error: "side must be LONG or SHORT" });
    return;
  }

  const result = await verifySodexTrade(symbol, String(sodexTradeId), side, Number(claimedPrice));
  res.json(result);
});

router.post("/trades", async (req, res) => {
  const { traderId, asset, side, entryPrice, exitPrice, pnlUsd, pnlPct,
          positionSize, leverage, isVerified, comment, txHash, sodexTradeId } = req.body;

  if (!traderId || !asset || !side || entryPrice === undefined || exitPrice === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (txHash && !TX_HASH_RE.test(String(txHash))) {
    res.status(400).json({ error: "txHash must be a valid 0x-prefixed 64-char hex string" });
    return;
  }

  const validatedTxHash = txHash ? String(txHash) : null;
  const validatedSodexTradeId = sodexTradeId ? String(sodexTradeId) : null;

  let isOnChainVerified = !!validatedTxHash;

  if (validatedSodexTradeId && !isOnChainVerified) {
    const verifyResult = await verifySodexTrade(
      asset,
      validatedSodexTradeId,
      side as "LONG" | "SHORT",
      Number(entryPrice)
    );
    isOnChainVerified = verifyResult.verified;
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
    isOnChainVerified,
    txHash: validatedTxHash,
    sodexTradeId: validatedSodexTradeId,
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
