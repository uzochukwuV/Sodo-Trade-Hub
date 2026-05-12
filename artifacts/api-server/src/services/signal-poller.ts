import { db, tradersTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchPositions, type SodexPosition } from "./leaderboard-tracker";
import { ingestPosition } from "./position-ingest";

export type PollerResult = {
  tradersChecked: number;
  newTrades: number;
  newSignals: number;
};

/**
 * REST-based safety net for position ingest.
 *
 * The PRIMARY ingest path is now the WS `accountUpdate` / `accountTrade`
 * subscriptions registered per tracked wallet (see services/sodex-ws.ts +
 * the bootstrap in src/index.ts). This poller exists to recover anything
 * missed during WS downtime and runs at a relaxed cadence (default 5 min).
 *
 * Both paths funnel through `ingestPosition()` so the dedup logic
 * (ON CONFLICT on sodexTradeId / sodexPositionId) is identical — and
 * `lastSyncedPositionId` is still advanced here so the poller stays cheap.
 */
export async function runSignalPollerOnce(): Promise<PollerResult> {
  const traders = await db.select().from(tradersTable).where(
    and(eq(tradersTable.isAutoDiscovered, true), isNotNull(tradersTable.walletAddress)),
  );

  const result: PollerResult = { tradersChecked: 0, newTrades: 0, newSignals: 0 };

  for (const trader of traders) {
    if (!trader.walletAddress) continue;
    result.tradersChecked++;

    let positions: SodexPosition[];
    try {
      positions = await fetchPositions(trader.walletAddress, 30);
    } catch (err) {
      logger.warn({ event: "poller.positions_fail", trader: trader.username, err: String(err) }, "positions fetch failed");
      continue;
    }

    const lastId = trader.lastSyncedPositionId ? parseInt(trader.lastSyncedPositionId, 10) : 0;
    const newPositions = positions.filter(p => p.id > lastId);
    if (newPositions.length === 0) continue;

    let newHigh = lastId;
    for (const p of newPositions) {
      if (p.id > newHigh) newHigh = p.id;
      const r = await ingestPosition(
        { id: trader.id, username: trader.username, walletAddress: trader.walletAddress },
        p,
      );
      if (r.kind === "trade") result.newTrades++;
      else if (r.kind === "signal") result.newSignals++;
    }

    if (newHigh > lastId) {
      await db.update(tradersTable).set({
        lastSyncedPositionId: String(newHigh),
        lastSyncedAt: new Date(),
      }).where(eq(tradersTable.id, trader.id));
    }
  }

  if (result.newTrades > 0 || result.newSignals > 0) {
    logger.info({ event: "poller.done", ...result }, "signal poller cycle complete");
  }
  return result;
}

let _pollerInterval: NodeJS.Timeout | null = null;

/** Default cadence is 5 min — the WS account streams are the primary ingest path. */
export function startSignalPoller(intervalMs = 5 * 60_000) {
  if (_pollerInterval) return;
  setTimeout(() => { runSignalPollerOnce().catch(err => logger.error({ err }, "initial poller run failed")); }, 60_000);
  _pollerInterval = setInterval(() => {
    runSignalPollerOnce().catch(err => logger.error({ err }, "scheduled poller run failed"));
  }, intervalMs);
  logger.info({ event: "poller.started", intervalMs, role: "safety-net" }, "signal poller started (REST safety net)");
}
