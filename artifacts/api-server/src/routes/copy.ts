import { Router, type IRouter } from "express";
import { db, copyConfigsTable, tradersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { ListCopyConfigsQueryParams, UpsertCopyConfigBody } from "@workspace/api-zod";

const router: IRouter = Router();

function mapConfigToResponse(config: typeof copyConfigsTable.$inferSelect, leader: typeof tradersTable.$inferSelect) {
  return {
    id: config.id,
    copierId: config.followerId,
    leaderId: config.leaderId,
    leaderUsername: leader.username,
    leaderHandle: leader.handle,
    leaderRepScore: Number(leader.repScore),
    leaderPnl30d: leader.totalPnlUsd,
    leaderWinRate: Number(leader.winRate),
    copyRatioPct: 100,
    maxPerTradeUsd: Number(config.maxPositionSizeUsd),
    stopCopyDrawdownPct: Number(config.stopLossPct),
    allowedPairs: [],
    copyPerps: true,
    copySpot: false,
    isActive: config.isActive,
  };
}

router.get("/copy", async (req, res) => {
  const parsed = ListCopyConfigsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { copierId } = parsed.data;
  const configs = await db
    .select({
      config: copyConfigsTable,
      leader: tradersTable,
    })
    .from(copyConfigsTable)
    .innerJoin(tradersTable, eq(copyConfigsTable.leaderId, tradersTable.id))
    .where(copierId ? eq(copyConfigsTable.followerId, copierId) : undefined)
    .orderBy(desc(copyConfigsTable.updatedAt))
    .limit(20);

  res.json({
    configs: configs.map(({ config, leader }) => mapConfigToResponse(config, leader)),
    total: configs.length,
  });
});

router.put("/copy", async (req, res) => {
  const parsed = UpsertCopyConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const existing = await db.query.copyConfigsTable.findFirst({
    where: and(
      eq(copyConfigsTable.followerId, data.copierId),
      eq(copyConfigsTable.leaderId, data.leaderId),
    ),
  });

  let config;
  if (existing) {
    [config] = await db.update(copyConfigsTable)
      .set({
        isActive: data.isActive ?? existing.isActive,
        maxPositionSizeUsd: data.maxPerTradeUsd !== undefined ? String(data.maxPerTradeUsd) : existing.maxPositionSizeUsd,
        stopLossPct: data.stopCopyDrawdownPct !== undefined ? String(data.stopCopyDrawdownPct) : existing.stopLossPct,
        updatedAt: new Date(),
      })
      .where(eq(copyConfigsTable.id, existing.id))
      .returning();
  } else {
    [config] = await db.insert(copyConfigsTable).values({
      followerId: data.copierId,
      leaderId: data.leaderId,
      isActive: data.isActive ?? true,
      maxPositionSizeUsd: data.maxPerTradeUsd !== undefined ? String(data.maxPerTradeUsd) : "500",
      maxLeverage: 5,
      stopLossPct: data.stopCopyDrawdownPct !== undefined ? String(data.stopCopyDrawdownPct) : "10",
    }).returning();
  }

  const leader = await db.query.tradersTable.findFirst({
    where: eq(tradersTable.id, config.leaderId),
  });

  if (!leader) {
    res.status(500).json({ error: "Leader not found" });
    return;
  }

  res.json(mapConfigToResponse(config, leader));
});

export default router;
