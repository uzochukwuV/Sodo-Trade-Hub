import { db, walletDailyRollupsTable, walletIntradayRollupsTable, walletPositionsTable, walletScoresTable, walletProfilesTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

function bucketStart(date: Date, bucketSizeMinutes: number): Date {
  const ms = bucketSizeMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

export async function recomputeWalletRollups(profileId: number) {
  const positions = await db.select().from(walletPositionsTable).where(eq(walletPositionsTable.walletProfileId, profileId));
  const closed = positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));
  const wins = closed.filter(p => Number(p.pnlUsd ?? 0) > 0).length;
  const pnlUsd = closed.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0);
  const avgLeverage = closed.length > 0 ? closed.reduce((sum, p) => sum + Number(p.leverage ?? 0), 0) / closed.length : 0;
  const avgHold = closed.filter(p => p.openedAt && p.closedAt).reduce((sum, p) => sum + ((p.closedAt!.getTime() - p.openedAt!.getTime()) / 60000), 0);
  const day = bucketStart(new Date(), 24 * 60);

  await db.insert(walletDailyRollupsTable).values({
    walletProfileId: profileId,
    day,
    tradeCount: closed.length,
    pnlUsd: pnlUsd.toFixed(2),
    winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(2) : "0",
    avgLeverage: avgLeverage.toFixed(2),
    avgHoldMinutes: closed.length > 0 ? (avgHold / closed.length).toFixed(2) : "0",
    drawdownUsd: Math.min(0, ...closed.map(p => Number(p.pnlUsd ?? 0))).toFixed(2),
    slippageUsd: "0",
  }).onConflictDoUpdate({
    target: [walletDailyRollupsTable.walletProfileId, walletDailyRollupsTable.day],
    set: {
      tradeCount: closed.length,
      pnlUsd: pnlUsd.toFixed(2),
      winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(2) : "0",
      avgLeverage: avgLeverage.toFixed(2),
      avgHoldMinutes: closed.length > 0 ? (avgHold / closed.length).toFixed(2) : "0",
      drawdownUsd: Math.min(0, ...closed.map(p => Number(p.pnlUsd ?? 0))).toFixed(2),
      slippageUsd: "0",
      updatedAt: new Date(),
    },
  });

  await db.insert(walletIntradayRollupsTable).values({
    walletProfileId: profileId,
    bucketStart: bucketStart(new Date(), 60),
    bucketSizeMinutes: 60,
    tradeCount: closed.length,
    pnlUsd: pnlUsd.toFixed(2),
    netFlowUsd: pnlUsd.toFixed(2),
  }).onConflictDoUpdate({
    target: [walletIntradayRollupsTable.walletProfileId, walletIntradayRollupsTable.bucketStart, walletIntradayRollupsTable.bucketSizeMinutes],
    set: {
      tradeCount: closed.length,
      pnlUsd: pnlUsd.toFixed(2),
      netFlowUsd: pnlUsd.toFixed(2),
      updatedAt: new Date(),
    },
  });

  logger.info({ profileId, pnlUsd, closed: closed.length }, "wallet rollups recomputed");
}

export async function recomputeAllWalletRollups(limit = 100) {
  const profiles = await db.select({ id: walletProfilesTable.id }).from(walletProfilesTable).limit(limit);
  for (const profile of profiles) {
    await recomputeWalletRollups(profile.id);
  }
  return { processed: profiles.length };
}

export async function ensureWalletRollupsWarm(profileId: number) {
  const [score] = await db.select().from(walletScoresTable).where(eq(walletScoresTable.walletProfileId, profileId)).limit(1);
  return {
    hasScore: !!score,
  };
}

