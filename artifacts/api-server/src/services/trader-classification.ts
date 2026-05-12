import { sql, type SQL } from "drizzle-orm";
import { tradersTable, tradesTable } from "@workspace/db";

/**
 * Tier-based "elite trader" classification — tunable in one place.
 *
 * A trader is treated as "elite" (i.e. their open positions surface on the
 * Signals page rather than the general Feed) when EITHER:
 *   - their tier is DIAMOND or GOLD, OR
 *   - they have realized at least $5,000 of closed PnL in the last 30 days.
 *
 * Both checks are computed in the API layer — no schema change needed.
 */
export const ELITE_TIERS = ["DIAMOND", "GOLD"] as const;
export type EliteTier = typeof ELITE_TIERS[number];
export const ELITE_30D_PNL_USD = 5000;
export const ELITE_LOOKBACK_DAYS = 30;

export type TraderForClassification = {
  tier: string;
  realized30dPnlUsd?: number;
};

/** Pure JS predicate — used when we already have the trader object hydrated. */
export function isEliteTrader(trader: TraderForClassification): boolean {
  if ((ELITE_TIERS as readonly string[]).includes(trader.tier)) return true;
  if ((trader.realized30dPnlUsd ?? 0) >= ELITE_30D_PNL_USD) return true;
  return false;
}

/**
 * SQL predicate for use inside a Drizzle WHERE clause when joining
 * `tradersTable`. Returns `traders.tier IN (...) OR (subquery >= threshold)`.
 *
 * The subquery is a correlated SUM over `trades.pnl_usd` for the last
 * ELITE_LOOKBACK_DAYS. COALESCE→0 protects against traders with no closed
 * trades in the window.
 */
export function eliteTraderSqlPredicate(): SQL {
  return sql`(
    ${tradersTable.tier} IN ('DIAMOND', 'GOLD')
    OR COALESCE((
      SELECT SUM(${tradesTable.pnlUsd})::float
      FROM ${tradesTable}
      WHERE ${tradesTable.traderId} = ${tradersTable.id}
        AND ${tradesTable.closedAt} >= NOW() - INTERVAL '${sql.raw(String(ELITE_LOOKBACK_DAYS))} days'
    ), 0) >= ${ELITE_30D_PNL_USD}
  )`;
}

/** Inverse predicate — non-elite traders for the Feed's "moderate signals" bucket. */
export function nonEliteTraderSqlPredicate(): SQL {
  return sql`NOT (
    ${tradersTable.tier} IN ('DIAMOND', 'GOLD')
    OR COALESCE((
      SELECT SUM(${tradesTable.pnlUsd})::float
      FROM ${tradesTable}
      WHERE ${tradesTable.traderId} = ${tradersTable.id}
        AND ${tradesTable.closedAt} >= NOW() - INTERVAL '${sql.raw(String(ELITE_LOOKBACK_DAYS))} days'
    ), 0) >= ${ELITE_30D_PNL_USD}
  )`;
}
