import { db, tradersTable, reputationEventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { InsertReputationEvent } from "@workspace/db";

type RepEventType = InsertReputationEvent["eventType"];

export async function fireRepEvent(
  traderId: number,
  eventType: RepEventType,
  delta: number,
  sourceId?: number,
  sourceType?: string,
  meta?: string
) {
  await db.insert(reputationEventsTable).values({
    traderId,
    eventType,
    delta: String(delta),
    sourceId: sourceId ?? null,
    sourceType: sourceType ?? null,
    meta: meta ?? null,
  });

  switch (eventType) {
    case "trade_win":
      await db.update(tradersTable)
        .set({
          streakDays: sql`${tradersTable.streakDays} + 1`,
          repScore: sql`LEAST(100, ${tradersTable.repScore} + 0.5)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "trade_loss":
      await db.update(tradersTable)
        .set({
          streakDays: sql`CASE WHEN ${tradersTable.streakShields} > 0 THEN ${tradersTable.streakDays} ELSE 0 END`,
          streakShields: sql`GREATEST(0, ${tradersTable.streakShields} - CASE WHEN ${tradersTable.streakShields} > 0 THEN 1 ELSE 0 END)`,
          repScore: sql`GREATEST(0, ${tradersTable.repScore} - 0.3)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "signal_hit":
      await db.update(tradersTable)
        .set({
          signalsHit: sql`${tradersTable.signalsHit} + 1`,
          totalSignals: sql`${tradersTable.totalSignals} + 1`,
          signalAccuracy: sql`
            CASE WHEN ${tradersTable.totalSignals} + 1 = 0 THEN 0
            ELSE ROUND(((${tradersTable.signalsHit} + 1)::numeric / (${tradersTable.totalSignals} + 1)) * 100, 2)
            END
          `,
          repScore: sql`LEAST(100, ${tradersTable.repScore} + 1)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "signal_stopped":
      await db.update(tradersTable)
        .set({
          signalsStopped: sql`${tradersTable.signalsStopped} + 1`,
          totalSignals: sql`${tradersTable.totalSignals} + 1`,
          signalAccuracy: sql`
            CASE WHEN ${tradersTable.totalSignals} + 1 = 0 THEN 0
            ELSE ROUND((${tradersTable.signalsHit}::numeric / (${tradersTable.totalSignals} + 1)) * 100, 2)
            END
          `,
          repScore: sql`GREATEST(0, ${tradersTable.repScore} - 0.5)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "breakdown_given":
      await db.update(tradersTable)
        .set({
          totalBreakdownsGiven: sql`${tradersTable.totalBreakdownsGiven} + 1`,
          mentorScore: sql`LEAST(100, ${tradersTable.mentorScore} + 0.5)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "breakdown_helpful":
      await db.update(tradersTable)
        .set({
          totalBreakdownsHelpful: sql`${tradersTable.totalBreakdownsHelpful} + 1`,
          mentorScore: sql`LEAST(100, ${tradersTable.mentorScore} + 3)`,
          streakShields: sql`LEAST(3, ${tradersTable.streakShields} + 1)`,
          repScore: sql`LEAST(100, ${tradersTable.repScore} + 1.5)`,
        })
        .where(eq(tradersTable.id, traderId));
      break;

    case "streak_extended":
      await db.update(tradersTable)
        .set({ streakDays: sql`${tradersTable.streakDays} + 1` })
        .where(eq(tradersTable.id, traderId));
      break;

    case "streak_broken":
      await db.update(tradersTable)
        .set({ streakDays: sql`0` })
        .where(eq(tradersTable.id, traderId));
      break;

    case "shield_earned":
      await db.update(tradersTable)
        .set({ streakShields: sql`LEAST(3, ${tradersTable.streakShields} + 1)` })
        .where(eq(tradersTable.id, traderId));
      break;

    case "shield_used":
      await db.update(tradersTable)
        .set({ streakShields: sql`GREATEST(0, ${tradersTable.streakShields} - 1)` })
        .where(eq(tradersTable.id, traderId));
      break;
  }
}

export async function recomputeRepScore(traderId: number) {
  const [trader] = await db.select().from(tradersTable).where(eq(tradersTable.id, traderId));
  if (!trader) return;

  const winRate = Number(trader.winRate);
  const signalAcc = Number(trader.signalAccuracy);
  const mentorScore = Number(trader.mentorScore);
  const streakBonus = Math.min(10, trader.streakDays * 0.5);

  const composite =
    winRate * 0.35 +
    signalAcc * 0.25 +
    mentorScore * 0.25 +
    streakBonus * 0.15;

  const tier =
    composite >= 85 ? "DIAMOND" :
    composite >= 70 ? "GOLD" :
    composite >= 50 ? "SILVER" : "BRONZE";

  await db.update(tradersTable)
    .set({
      repScore: String(Math.min(100, composite).toFixed(2)),
      tier: tier as "DIAMOND" | "GOLD" | "SILVER" | "BRONZE",
    })
    .where(eq(tradersTable.id, traderId));
}
