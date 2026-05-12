import { db, alertsTable, followsTable, usersTable, tradeIntentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

type AlertType = "trader_open" | "trader_close" | "new_comment" | "intent_voted" | "intent_resolved" | "intent_alignment" | "graph_signal";

async function pushAlert(userId: number, type: AlertType, title: string, body: string | null, payload: Record<string, unknown>) {
  try {
    await db.insert(alertsTable).values({ userId, type, title, body, payload });
  } catch (err) {
    logger.warn({ err, userId, type }, "alerts.insert_fail");
  }
}

/**
 * Fan-out an event from a tracked trader (e.g. they just opened a new position) to
 * the alert inboxes of every Sogram user who follows that trader.
 *
 * `followsTable` maps follower→trader where follower is a `traders` row id, but our
 * users table has its own id space. We bridge via `users.traderId` (set when a user's
 * wallet matches a tracked trader) to find Sogram users who follow this trader id.
 */
async function followersOfTrader(traderId: number): Promise<number[]> {
  // First: which trader-ids follow this trader?
  const followerTraderIds = await db
    .select({ followerId: followsTable.followerId })
    .from(followsTable)
    .where(eq(followsTable.followingId, traderId));
  if (followerTraderIds.length === 0) return [];
  const ids = followerTraderIds.map(f => f.followerId);
  // Now resolve those trader-ids to Sogram user ids.
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArrayHelper(usersTable.traderId, ids));
  return users.map(u => u.id);
}

// drizzle's `inArray` import is awkward in our module; tiny helper that accepts
// number[] and returns the same SQL fragment.
import { inArray } from "drizzle-orm";
function inArrayHelper<T extends import("drizzle-orm/pg-core").PgColumn>(col: T, vals: number[]) {
  return inArray(col, vals);
}

export async function notifyTraderOpenedPosition(traderId: number, info: { username: string; asset: string; side: string; entryPrice: number; leverage: number; sodexPositionId: string; walletAddress: string | null }) {
  const userIds = await followersOfTrader(traderId);
  for (const uid of userIds) {
    await pushAlert(uid, "trader_open", `${info.username} opened ${info.side} ${info.asset}`, `${info.leverage}x · entry $${info.entryPrice.toFixed(4)}`, info);
  }
}

export async function notifyTraderClosedPosition(traderId: number, info: { username: string; asset: string; side: string; pnlUsd: number; sodexTradeId: string; walletAddress: string | null }) {
  const userIds = await followersOfTrader(traderId);
  for (const uid of userIds) {
    const verb = info.pnlUsd >= 0 ? "WIN" : "LOSS";
    await pushAlert(uid, "trader_close", `${info.username} closed ${info.asset} · ${verb}`, `${info.side} · ${info.pnlUsd >= 0 ? "+" : ""}$${info.pnlUsd.toFixed(0)}`, info);
  }
}

/**
 * When a tracked trader opens a position aligned with an open user-posted intent,
 * notify the intent author. Strong validation signal — "a top trader just confirmed your call".
 */
export async function notifyIntentAlignment(opts: { asset: string; side: string; tradedByTraderId: number; tradedByUsername: string }) {
  const openIntents = await db
    .select({ id: tradeIntentsTable.id, traderId: tradeIntentsTable.traderId, asset: tradeIntentsTable.asset, side: tradeIntentsTable.side })
    .from(tradeIntentsTable)
    .where(and(eq(tradeIntentsTable.asset, opts.asset), eq(tradeIntentsTable.side, opts.side as "LONG" | "SHORT"), eq(tradeIntentsTable.status, "open")));

  if (openIntents.length === 0) return;
  // Resolve which Sogram users own these intents.
  const intentTraderIds = openIntents.map(i => i.traderId);
  const users = await db.select({ id: usersTable.id, traderId: usersTable.traderId }).from(usersTable).where(inArrayHelper(usersTable.traderId, intentTraderIds));

  for (const u of users) {
    const matching = openIntents.find(i => i.traderId === u.traderId);
    if (!matching) continue;
    await pushAlert(u.id, "intent_alignment", `${opts.tradedByUsername} just confirmed your ${opts.side} ${opts.asset} call`, "A tracked top trader entered the same position you posted as an intent.", { intentId: matching.id, ...opts });
  }
}
