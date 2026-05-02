import { Router, type IRouter } from "express";
import { db, tradersTable, tradeIntentsTable, intentVotesTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { fireRepEvent } from "../lib/reputation";

const router: IRouter = Router();

router.get("/intents", async (req, res) => {
  const { status, asset, side, traderId, limit = 20, offset = 0 } = req.query;

  const filters: ReturnType<typeof eq>[] = [];
  if (status && ["open", "closed_hit", "closed_miss", "expired"].includes(String(status))) {
    filters.push(eq(tradeIntentsTable.status, String(status) as "open" | "closed_hit" | "closed_miss" | "expired"));
  }
  if (asset) filters.push(eq(tradeIntentsTable.asset, String(asset)));
  if (side === "LONG" || side === "SHORT") filters.push(eq(tradeIntentsTable.side, side));
  if (traderId) filters.push(eq(tradeIntentsTable.traderId, Number(traderId)));

  const rows = await db
    .select({ intent: tradeIntentsTable, trader: tradersTable })
    .from(tradeIntentsTable)
    .innerJoin(tradersTable, eq(tradeIntentsTable.traderId, tradersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(tradeIntentsTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(tradeIntentsTable)
    .where(filters.length > 0 ? and(...filters) : undefined);

  res.json({
    intents: rows.map(({ intent, trader }) => {
      const totalVotes = intent.votesValid + intent.votesInvalid;
      return {
        id: intent.id,
        traderId: intent.traderId,
        traderUsername: trader.username,
        traderHandle: trader.handle,
        traderRepScore: Number(trader.repScore),
        traderTier: trader.tier,
        traderValidationAccuracy: Number(trader.validationAccuracy),
        asset: intent.asset,
        side: intent.side,
        entryPrice: intent.entryPrice,
        targetPrice: intent.targetPrice,
        stopLoss: intent.stopLoss,
        leverage: intent.leverage,
        reasoning: intent.reasoning,
        votesValid: intent.votesValid,
        votesInvalid: intent.votesInvalid,
        totalVotes,
        validPct: totalVotes > 0 ? Math.round((intent.votesValid / totalVotes) * 100) : 50,
        status: intent.status,
        expiresAt: intent.expiresAt.toISOString(),
        createdAt: intent.createdAt.toISOString(),
      };
    }),
    total,
  });
});

router.post("/intents", async (req, res) => {
  const { traderId, asset, side, entryPrice, targetPrice, stopLoss, leverage, reasoning } = req.body;

  if (!traderId || !asset || !side || !entryPrice || !targetPrice || !stopLoss || !reasoning) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const trader = await db.select().from(tradersTable).where(eq(tradersTable.id, Number(traderId))).limit(1);
  if (!trader[0]) {
    res.status(404).json({ error: "Trader not found" });
    return;
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [intent] = await db.insert(tradeIntentsTable).values({
    traderId: Number(traderId),
    asset: String(asset),
    side: String(side) as "LONG" | "SHORT",
    entryPrice: String(entryPrice),
    targetPrice: String(targetPrice),
    stopLoss: String(stopLoss),
    leverage: Number(leverage ?? 1),
    reasoning: String(reasoning),
    expiresAt,
  }).returning();

  res.status(201).json(intent);
});

router.post("/intents/:intentId/vote", async (req, res) => {
  const intentId = Number(req.params.intentId);
  const { vote, voterId } = req.body;

  if (vote !== "valid" && vote !== "invalid") {
    res.status(400).json({ error: "vote must be 'valid' or 'invalid'" });
    return;
  }
  if (!voterId) {
    res.status(400).json({ error: "voterId is required" });
    return;
  }

  const [intent] = await db.select().from(tradeIntentsTable).where(eq(tradeIntentsTable.id, intentId));
  if (!intent) {
    res.status(404).json({ error: "Intent not found" });
    return;
  }
  if (intent.status !== "open") {
    res.status(400).json({ error: "Voting is closed for this intent" });
    return;
  }
  if (intent.traderId === Number(voterId)) {
    res.status(400).json({ error: "Cannot vote on your own intent" });
    return;
  }

  const existing = await db.select().from(intentVotesTable)
    .where(and(eq(intentVotesTable.intentId, intentId), eq(intentVotesTable.voterId, Number(voterId))))
    .limit(1);

  if (existing[0]) {
    res.status(409).json({ error: "Already voted on this intent" });
    return;
  }

  await db.insert(intentVotesTable).values({
    intentId,
    voterId: Number(voterId),
    vote: vote as "valid" | "invalid",
  });

  const [updated] = await db.update(tradeIntentsTable)
    .set({
      votesValid: vote === "valid" ? sql`${tradeIntentsTable.votesValid} + 1` : tradeIntentsTable.votesValid,
      votesInvalid: vote === "invalid" ? sql`${tradeIntentsTable.votesInvalid} + 1` : tradeIntentsTable.votesInvalid,
    })
    .where(eq(tradeIntentsTable.id, intentId))
    .returning();

  const totalVotes = updated.votesValid + updated.votesInvalid;
  const validPct = totalVotes > 0 ? Math.round((updated.votesValid / totalVotes) * 100) : 50;

  res.json({ ok: true, votesValid: updated.votesValid, votesInvalid: updated.votesInvalid, totalVotes, validPct });
});

router.post("/intents/:intentId/resolve", async (req, res) => {
  const intentId = Number(req.params.intentId);
  const { outcome } = req.body;

  if (outcome !== "hit" && outcome !== "miss") {
    res.status(400).json({ error: "outcome must be 'hit' or 'miss'" });
    return;
  }

  const [intent] = await db.select().from(tradeIntentsTable).where(eq(tradeIntentsTable.id, intentId));
  if (!intent) {
    res.status(404).json({ error: "Intent not found" });
    return;
  }

  const newStatus = outcome === "hit" ? "closed_hit" : "closed_miss";
  await db.update(tradeIntentsTable).set({ status: newStatus }).where(eq(tradeIntentsTable.id, intentId));

  const majorityVotedValid = intent.votesValid >= intent.votesInvalid;
  const outcomeIsHit = outcome === "hit";

  const voters = await db.select().from(intentVotesTable).where(eq(intentVotesTable.intentId, intentId));

  for (const voter of voters) {
    const votedValid = voter.vote === "valid";
    const wasCorrect = votedValid === outcomeIsHit;
    if (wasCorrect) {
      await fireRepEvent(voter.voterId, "validation_correct", 0.3, intentId, "intent");
    } else {
      await fireRepEvent(voter.voterId, "validation_wrong", -0.1, intentId, "intent");
    }
  }

  void majorityVotedValid;
  res.json({ ok: true, status: newStatus, votersRewarded: voters.length });
});

export default router;
