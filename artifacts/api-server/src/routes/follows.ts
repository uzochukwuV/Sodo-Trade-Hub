import { Router, type IRouter } from "express";
import { db, followsTable, tradersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router: IRouter = Router();

router.post("/traders/:traderId/follow", async (req, res) => {
  const traderId = Number(req.params.traderId);
  const { followerId } = req.body;

  if (!followerId || isNaN(traderId)) {
    res.status(400).json({ error: "Missing followerId or invalid traderId" });
    return;
  }
  if (followerId === traderId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  await db.insert(followsTable).values({ followerId: Number(followerId), followingId: traderId }).onConflictDoNothing();

  await db.update(tradersTable)
    .set({ followerCount: sql`${tradersTable.followerCount} + 1` })
    .where(eq(tradersTable.id, traderId));

  const trader = await db.query.tradersTable.findFirst({ where: eq(tradersTable.id, traderId) });
  res.json({ following: true, followerCount: trader?.followerCount ?? 0 });
});

router.delete("/traders/:traderId/follow", async (req, res) => {
  const traderId = Number(req.params.traderId);
  const { followerId } = req.body;

  if (!followerId || isNaN(traderId)) {
    res.status(400).json({ error: "Missing followerId or invalid traderId" });
    return;
  }

  const deleted = await db.delete(followsTable)
    .where(and(eq(followsTable.followerId, Number(followerId)), eq(followsTable.followingId, traderId)))
    .returning();

  if (deleted.length > 0) {
    await db.update(tradersTable)
      .set({ followerCount: sql`GREATEST(${tradersTable.followerCount} - 1, 0)` })
      .where(eq(tradersTable.id, traderId));
  }

  const trader = await db.query.tradersTable.findFirst({ where: eq(tradersTable.id, traderId) });
  res.json({ following: false, followerCount: trader?.followerCount ?? 0 });
});

router.get("/traders/:traderId/followers", async (req, res) => {
  const traderId = Number(req.params.traderId);
  const viewerFollowerId = req.query.followerId ? Number(req.query.followerId) : null;

  const trader = await db.query.tradersTable.findFirst({ where: eq(tradersTable.id, traderId) });
  if (!trader) {
    res.status(404).json({ error: "Trader not found" });
    return;
  }

  const [followingRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(followsTable)
    .where(eq(followsTable.followerId, traderId));

  let isFollowing = false;
  if (viewerFollowerId) {
    const existing = await db.query.followsTable.findFirst({
      where: and(eq(followsTable.followerId, viewerFollowerId), eq(followsTable.followingId, traderId)),
    });
    isFollowing = !!existing;
  }

  res.json({
    traderId,
    followerCount: trader.followerCount,
    followingCount: Number(followingRow?.value ?? 0),
    isFollowing,
  });
});

export default router;
