import { Router, type IRouter } from "express";
import { db, copyConfigsTable, tradersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { ListCopyConfigsQueryParams, UpsertCopyConfigBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/copy-configs", async (req, res) => {
  const parsed = ListCopyConfigsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { followerId, limit, offset } = parsed.data;
  const configs = await db
    .select({
      config: copyConfigsTable,
      leader: tradersTable,
    })
    .from(copyConfigsTable)
    .innerJoin(tradersTable, eq(copyConfigsTable.leaderId, tradersTable.id))
    .where(followerId ? eq(copyConfigsTable.followerId, followerId) : undefined)
    .orderBy(desc(copyConfigsTable.updatedAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  res.json({
    configs: configs.map(({ config, leader }) => ({
      ...config,
      leaderUsername: leader.username,
      leaderHandle: leader.handle,
      leaderRepScore: Number(leader.repScore),
      leaderTier: leader.tier,
    })),
    total: configs.length,
  });
});

router.put("/copy-configs", async (req, res) => {
  const parsed = UpsertCopyConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const existing = await db.query.copyConfigsTable.findFirst({
    where: and(
      eq(copyConfigsTable.followerId, data.followerId),
      eq(copyConfigsTable.leaderId, data.leaderId),
    ),
  });

  let config;
  if (existing) {
    [config] = await db.update(copyConfigsTable)
      .set({
        isActive: data.isActive ?? existing.isActive,
        maxPositionSizeUsd: data.maxPositionSizeUsd !== undefined ? String(data.maxPositionSizeUsd) : existing.maxPositionSizeUsd,
        maxLeverage: data.maxLeverage ?? existing.maxLeverage,
        stopLossPct: data.stopLossPct !== undefined ? String(data.stopLossPct) : existing.stopLossPct,
        updatedAt: new Date(),
      })
      .where(eq(copyConfigsTable.id, existing.id))
      .returning();
  } else {
    [config] = await db.insert(copyConfigsTable).values({
      followerId: data.followerId,
      leaderId: data.leaderId,
      isActive: data.isActive ?? true,
      maxPositionSizeUsd: data.maxPositionSizeUsd !== undefined ? String(data.maxPositionSizeUsd) : "100",
      maxLeverage: data.maxLeverage ?? 5,
      stopLossPct: data.stopLossPct !== undefined ? String(data.stopLossPct) : "10",
    }).returning();
  }
  res.json(config);
});

export default router;
