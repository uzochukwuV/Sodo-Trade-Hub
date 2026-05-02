import { db, signalsTable, tradersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fireRepEvent, recomputeRepScore } from "../lib/reputation";
import { logger } from "../lib/logger";
import { getPrice } from "../services/market";

async function getMarketPrice(asset: string): Promise<number | null> {
  return getPrice(asset);
}

export async function resolveOpenSignals() {
  const openSignals = await db
    .select()
    .from(signalsTable)
    .where(and(eq(signalsTable.isActive, true), eq(signalsTable.status, "open")));

  for (const signal of openSignals) {
    const price = await getMarketPrice(signal.asset);
    if (price === null) continue;

    const entry = Number(signal.entryPrice);
    const target = Number(signal.targetPrice);
    const stop = Number(signal.stopLoss);

    let outcome: "hit" | "stopped" | null = null;

    if (signal.side === "LONG") {
      if (price >= target) outcome = "hit";
      else if (price <= stop) outcome = "stopped";
    } else {
      if (price <= target) outcome = "hit";
      else if (price >= stop) outcome = "stopped";
    }

    if (!outcome) continue;

    await db.update(signalsTable)
      .set({ status: outcome, isActive: false })
      .where(eq(signalsTable.id, signal.id));

    const eventType = outcome === "hit" ? "signal_hit" : "signal_stopped";
    const delta = outcome === "hit" ? 1 : -0.5;

    await fireRepEvent(signal.traderId, eventType, delta, signal.id, "signal");
    await recomputeRepScore(signal.traderId);

    await db.update(tradersTable)
      .set({
        signalsHit: outcome === "hit"
          ? db.$count(signalsTable, and(eq(signalsTable.traderId, signal.traderId), eq(signalsTable.status, "hit")))
          : tradersTable.signalsHit,
        signalsStopped: outcome === "stopped"
          ? db.$count(signalsTable, and(eq(signalsTable.traderId, signal.traderId), eq(signalsTable.status, "stopped")))
          : tradersTable.signalsStopped,
      })
      .where(eq(tradersTable.id, signal.traderId));

    logger.info({ signalId: signal.id, asset: signal.asset, outcome, price }, "Signal auto-resolved");
  }

  if (openSignals.length > 0) {
    logger.info({ checked: openSignals.length }, "Signal auto-resolve pass complete");
  }
}

export function startSignalResolver(intervalMs = 60_000) {
  resolveOpenSignals().catch(e => logger.error(e, "Signal resolver error"));
  return setInterval(() => {
    resolveOpenSignals().catch(e => logger.error(e, "Signal resolver error"));
  }, intervalMs);
}
