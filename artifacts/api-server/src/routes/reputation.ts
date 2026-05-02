import { Router, type IRouter } from "express";
import { db, tradersTable, reputationEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/traders/:traderId/reputation", async (req, res) => {
  const traderId = Number(req.params.traderId);
  if (isNaN(traderId)) {
    res.status(400).json({ error: "Invalid traderId" });
    return;
  }

  const [trader] = await db.select().from(tradersTable).where(eq(tradersTable.id, traderId));
  if (!trader) {
    res.status(404).json({ error: "Trader not found" });
    return;
  }

  const recentEvents = await db
    .select()
    .from(reputationEventsTable)
    .where(eq(reputationEventsTable.traderId, traderId))
    .orderBy(desc(reputationEventsTable.createdAt))
    .limit(20);

  res.json({
    traderId: trader.id,
    username: trader.username,
    repScore: Number(trader.repScore),
    tier: trader.tier,
    winRate: Number(trader.winRate),
    signalAccuracy: Number(trader.signalAccuracy),
    validationAccuracy: Number(trader.validationAccuracy),
    mentorScore: Number(trader.mentorScore),
    streakDays: trader.streakDays,
    streakShields: trader.streakShields,
    totalSignals: trader.totalSignals,
    signalsHit: trader.signalsHit,
    signalsStopped: trader.signalsStopped,
    totalBreakdownsGiven: trader.totalBreakdownsGiven,
    totalBreakdownsHelpful: trader.totalBreakdownsHelpful,
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      eventType: e.eventType,
      delta: Number(e.delta),
      sourceType: e.sourceType ?? undefined,
      meta: e.meta ?? undefined,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

export default router;
