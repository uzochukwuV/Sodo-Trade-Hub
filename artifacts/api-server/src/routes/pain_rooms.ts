import { Router, type IRouter } from "express";
import { db, painRoomsTable, breakdownsTable, tradersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { fireRepEvent, recomputeRepScore } from "../lib/reputation";

const router: IRouter = Router();

function formatPainRoom(pr: typeof painRoomsTable.$inferSelect, trader: typeof tradersTable.$inferSelect, breakdowns: ReturnType<typeof formatBreakdown>[]) {
  return {
    id: pr.id,
    traderId: pr.traderId,
    traderUsername: pr.isAnonymous ? "Anonymous" : trader.username,
    traderHandle: pr.isAnonymous ? "anon" : trader.handle,
    traderRepScore: pr.isAnonymous ? 0 : trader.repScore,
    traderTier: pr.isAnonymous ? "SILVER" : trader.tier,
    traderStreakDays: pr.isAnonymous ? 0 : trader.streakDays,
    traderStreakShields: pr.isAnonymous ? 0 : trader.streakShields,
    asset: pr.asset,
    side: pr.side,
    entryPrice: pr.entryPrice,
    exitPrice: pr.exitPrice,
    pnlUsd: pr.pnlUsd,
    pnlPct: pr.pnlPct,
    leverage: pr.leverage,
    positionSize: pr.positionSize,
    comment: pr.comment ?? null,
    isAnonymous: pr.isAnonymous,
    isResolved: pr.isResolved,
    resolvedBreakdownId: pr.resolvedBreakdownId ?? null,
    likeCount: pr.likeCount,
    breakdownCount: pr.breakdownCount,
    breakdowns,
    createdAt: pr.createdAt.toISOString(),
  };
}

function formatBreakdown(bd: typeof breakdownsTable.$inferSelect, responder: typeof tradersTable.$inferSelect) {
  return {
    id: bd.id,
    painRoomId: bd.painRoomId,
    responderId: bd.responderId,
    responderUsername: responder.username,
    responderHandle: responder.handle,
    responderRepScore: responder.repScore,
    responderTier: responder.tier,
    responderMentorScore: responder.mentorScore,
    responderStreakDays: responder.streakDays,
    whatFailed: bd.whatFailed,
    dataShowed: bd.dataShowed,
    doDifferently: bd.doDifferently,
    likeCount: bd.likeCount,
    isMarkedHelpful: bd.isMarkedHelpful,
    createdAt: bd.createdAt.toISOString(),
  };
}

router.get("/pain-rooms", async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const rows = await db
      .select({ painRoom: painRoomsTable, trader: tradersTable })
      .from(painRoomsTable)
      .innerJoin(tradersTable, eq(painRoomsTable.traderId, tradersTable.id))
      .orderBy(desc(painRoomsTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(painRoomsTable);

    const painRoomsWithBreakdowns = await Promise.all(
      rows.map(async ({ painRoom, trader }) => {
        const bdRows = await db
          .select({ breakdown: breakdownsTable, responder: tradersTable })
          .from(breakdownsTable)
          .innerJoin(tradersTable, eq(breakdownsTable.responderId, tradersTable.id))
          .where(eq(breakdownsTable.painRoomId, painRoom.id))
          .orderBy(desc(tradersTable.repScore));
        return formatPainRoom(painRoom, trader, bdRows.map(({ breakdown, responder }) => formatBreakdown(breakdown, responder)));
      })
    );

    res.json({ painRooms: painRoomsWithBreakdowns, total });
  } catch (err) {
    req.log.error(err, "Failed to list pain rooms");
    res.status(500).json({ error: "Failed to list pain rooms" });
  }
});

router.post("/pain-rooms", async (req, res) => {
  try {
    const { traderId, asset, side, entryPrice, exitPrice, pnlUsd, pnlPct, leverage, positionSize, comment, isAnonymous } = req.body;
    const [created] = await db.insert(painRoomsTable).values({
      traderId, asset, side, entryPrice, exitPrice, pnlUsd, pnlPct, leverage: leverage ?? 1,
      positionSize: positionSize ?? "0", comment: comment ?? null, isAnonymous: isAnonymous ?? false,
    }).returning();
    const [trader] = await db.select().from(tradersTable).where(eq(tradersTable.id, traderId));
    res.status(201).json(formatPainRoom(created, trader, []));
  } catch (err) {
    req.log.error(err, "Failed to create pain room");
    res.status(500).json({ error: "Failed to create pain room" });
  }
});

router.post("/pain-rooms/:painRoomId/breakdowns", async (req, res) => {
  try {
    const painRoomId = Number(req.params.painRoomId);
    const { responderId, whatFailed, dataShowed, doDifferently } = req.body;
    const [bd] = await db.insert(breakdownsTable).values({
      painRoomId, responderId, whatFailed, dataShowed, doDifferently,
    }).returning();
    await db.update(painRoomsTable)
      .set({ breakdownCount: sql`${painRoomsTable.breakdownCount} + 1` })
      .where(eq(painRoomsTable.id, painRoomId));

    await fireRepEvent(responderId, "breakdown_given", 0.5, bd.id, "breakdown");
    await recomputeRepScore(responderId);

    const [responder] = await db.select().from(tradersTable).where(eq(tradersTable.id, responderId));
    res.status(201).json(formatBreakdown(bd, responder));
  } catch (err) {
    req.log.error(err, "Failed to add breakdown");
    res.status(500).json({ error: "Failed to add breakdown" });
  }
});

router.post("/pain-rooms/:painRoomId/resolve/:breakdownId", async (req, res) => {
  try {
    const painRoomId = Number(req.params.painRoomId);
    const breakdownId = Number(req.params.breakdownId);

    await db.update(painRoomsTable)
      .set({ isResolved: true, resolvedBreakdownId: breakdownId })
      .where(eq(painRoomsTable.id, painRoomId));
    await db.update(breakdownsTable)
      .set({ isMarkedHelpful: true })
      .where(eq(breakdownsTable.id, breakdownId));

    const [bd] = await db.select().from(breakdownsTable).where(eq(breakdownsTable.id, breakdownId));
    if (bd) {
      await fireRepEvent(bd.responderId, "breakdown_helpful", 3, bd.id, "breakdown");
      await recomputeRepScore(bd.responderId);
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to resolve breakdown");
    res.status(500).json({ error: "Failed to resolve" });
  }
});

router.post("/pain-rooms/:painRoomId/like", async (req, res) => {
  try {
    const painRoomId = Number(req.params.painRoomId);
    const [updated] = await db.update(painRoomsTable)
      .set({ likeCount: sql`${painRoomsTable.likeCount} + 1` })
      .where(eq(painRoomsTable.id, painRoomId))
      .returning({ likeCount: painRoomsTable.likeCount });
    res.json({ likeCount: updated.likeCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to like" });
  }
});

router.post("/breakdowns/:breakdownId/like", async (req, res) => {
  try {
    const breakdownId = Number(req.params.breakdownId);
    const [updated] = await db.update(breakdownsTable)
      .set({ likeCount: sql`${breakdownsTable.likeCount} + 1` })
      .where(eq(breakdownsTable.id, breakdownId))
      .returning({ likeCount: breakdownsTable.likeCount });
    res.json({ likeCount: updated.likeCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to like" });
  }
});

export default router;
