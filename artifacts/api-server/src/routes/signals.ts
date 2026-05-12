import { Router, type IRouter } from "express";
import { db, signalsTable, tradersTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { LikeSignalParams } from "@workspace/api-zod";
import { fireRepEvent, recomputeRepScore } from "../lib/reputation";
import { eliteTraderSqlPredicate } from "../services/trader-classification";

const router: IRouter = Router();

router.get("/signals", async (req, res) => {
  const { asset, side, status, minConfidence, traderId, limit = 20, offset = 0 } = req.query;
  // Default to elite-only on the Signals page; the page exposes a toggle to
  // include everyone. `false` / `0` opt out; anything else (incl. omitted) is
  // treated as truthy. A traderId filter always wins (profile drill-down).
  const eliteOnly =
    !traderId &&
    req.query.eliteOnly !== "false" &&
    req.query.eliteOnly !== "0";

  const filters = [];
  if (asset) filters.push(eq(signalsTable.asset, String(asset)));
  if (side === "LONG" || side === "SHORT") filters.push(eq(signalsTable.side, side));
  // Status filter: explicit value wins. If omitted AND no traderId is set
  // (i.e. the Signals page list, not a profile drill-down), default to "open"
  // so the page only surfaces live setups.
  const effectiveStatus =
    status === "all"
      ? undefined
      : status === "open" || status === "hit" || status === "stopped"
      ? status
      : !traderId
        ? "open"
        : undefined;
  if (effectiveStatus) filters.push(eq(signalsTable.status, effectiveStatus));
  if (minConfidence) filters.push(gte(signalsTable.confidence, Number(minConfidence)));
  if (traderId) filters.push(eq(signalsTable.traderId, Number(traderId)));
  if (eliteOnly) filters.push(eliteTraderSqlPredicate());

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      signal: signalsTable,
      trader: tradersTable,
    })
    .from(signalsTable)
    .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
    .where(whereClause)
    .orderBy(sql`${signalsTable.createdAt} desc`)
    .limit(Number(limit))
    .offset(Number(offset));

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(signalsTable)
    .innerJoin(tradersTable, eq(signalsTable.traderId, tradersTable.id))
    .where(whereClause);

  res.json({
    signals: rows.map(({ signal, trader }) => ({
      id: signal.id,
      traderId: signal.traderId,
      traderUsername: trader.username,
      traderHandle: trader.handle,
      traderRepScore: Number(trader.repScore),
      traderTier: trader.tier,
      traderSignalAccuracy: Number(trader.signalAccuracy),
      traderStreakDays: trader.streakDays,
      traderWalletAddress: trader.walletAddress ?? undefined,
      traderIsAutoDiscovered: trader.isAutoDiscovered,
      txHash: signal.txHash ?? undefined,
      sodexPositionId: signal.sodexPositionId ?? undefined,
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

router.post("/signals/:signalId/resolve", async (req, res) => {
  const signalId = Number(req.params.signalId);
  const { outcome } = req.body;

  if (outcome !== "hit" && outcome !== "stopped") {
    res.status(400).json({ error: "outcome must be 'hit' or 'stopped'" });
    return;
  }

  const [signal] = await db.select().from(signalsTable).where(eq(signalsTable.id, signalId));
  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  await db.update(signalsTable)
    .set({ status: outcome, isActive: false })
    .where(eq(signalsTable.id, signalId));

  const eventType = outcome === "hit" ? "signal_hit" : "signal_stopped";
  const delta = outcome === "hit" ? 1 : -0.5;

  await fireRepEvent(signal.traderId, eventType, delta, signalId, "signal");
  await recomputeRepScore(signal.traderId);

  res.json({ ok: true, status: outcome });
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
