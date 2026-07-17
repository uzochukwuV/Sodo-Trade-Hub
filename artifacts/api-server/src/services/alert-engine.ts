import { db, alertRulesTable, alertMatchesTable, alertsTable, watchlistsTable, watchlistItemsTable, walletProfilesTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dispatchNotification } from "./notification-dispatch";
import { recordAlertOutcome } from "./alert-outcomes";

export type AlertEvent =
  | {
      eventType: "open_position" | "close_position";
      subjectType: "wallet";
      subjectId: string;
      walletAddress: string;
      traderId?: number | null;
      username?: string | null;
      asset: string;
      side: "LONG" | "SHORT";
      pnlUsd?: number;
      leverage?: number;
      notionalUsd?: number;
      title: string;
      body: string;
      payload: Record<string, unknown>;
    }
  | {
      eventType: "big_pnl" | "whale" | "leaderboard_shift" | "price_move" | "trade_context" | "signal";
      subjectType: "market" | "leaderboard" | "wallet";
      subjectId: string;
      walletAddress?: string | null;
      traderId?: number | null;
      username?: string | null;
      asset?: string;
      side?: "LONG" | "SHORT";
      pnlUsd?: number;
      leverage?: number;
      notionalUsd?: number;
      title: string;
      body: string;
      payload: Record<string, unknown>;
    };

function normalizeText(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(normalizeText);
  if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  return [];
}

function matchesRuleFilters(filters: unknown, event: AlertEvent, walletProfileId: number | null): boolean {
  const f = (filters && typeof filters === "object" ? filters as Record<string, unknown> : {}) as Record<string, unknown>;
  const walletAddresses = normalizeText(f.walletAddresses);
  const traderIds = normalizeText(f.traderIds).map(v => Number(v)).filter(Number.isFinite);
  const symbols = normalizeText(f.symbols);
  const minPnlUsd = typeof f.minPnlUsd === "number" ? f.minPnlUsd : Number(f.minPnlUsd ?? 0);
  const minNotionalUsd = typeof f.minNotionalUsd === "number" ? f.minNotionalUsd : Number(f.minNotionalUsd ?? 0);

  if (walletAddresses.length > 0 && !walletAddresses.map(a => a.toLowerCase()).includes(event.walletAddress?.toLowerCase() ?? "")) return false;
  if (traderIds.length > 0 && !traderIds.includes(Number(event.traderId ?? -1))) return false;
  if (symbols.length > 0 && event.asset && !symbols.includes(event.asset)) return false;
  if (minPnlUsd && Number(event.pnlUsd ?? 0) < minPnlUsd) return false;
  if (minNotionalUsd && Number(event.notionalUsd ?? 0) < minNotionalUsd) return false;
  if (typeof f.walletProfileId === "number" && walletProfileId !== f.walletProfileId) return false;
  return true;
}

async function alertInbox(userId: number, ruleId: number, event: AlertEvent) {
  const [row] = await db.insert(alertMatchesTable).values({
    alertRuleId: ruleId,
    userId,
    eventType: event.eventType,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    payload: event.payload,
    status: "pending",
  }).returning();

  await db.insert(alertsTable).values({
    userId,
    type: event.eventType === "open_position" ? "trader_open"
      : event.eventType === "close_position" ? "trader_close"
      : event.eventType === "big_pnl" ? "trader_close"
      : "graph_signal",
    title: event.title,
    body: event.body,
    payload: event.payload,
  });

  await recordAlertOutcome(row?.id, event);

  await dispatchNotification({
    userId,
    alertMatchId: row?.id,
    title: event.title,
    body: event.body,
    payload: event.payload,
  });
}

async function autoWatchlistMatches(event: AlertEvent) {
  const watchlists = await db.select({
    watchlist: watchlistsTable,
    item: watchlistItemsTable,
  })
    .from(watchlistsTable)
    .leftJoin(watchlistItemsTable, eq(watchlistsTable.id, watchlistItemsTable.watchlistId));

  // Watchlists are user-owned, so match by explicit wallet, asset, or kind-driven defaults.
  const profile = event.walletAddress
    ? await db.query.walletProfilesTable.findFirst({ where: eq(walletProfilesTable.walletAddress, event.walletAddress.toLowerCase()) })
    : null;
  for (const row of watchlists) {
    const item = row.item;
    if (!item) continue;
    const itemWalletId = item.walletProfileId ?? null;
    const itemWalletAddress = item.walletAddress?.toLowerCase() ?? null;
    const itemSymbol = item.symbol ?? null;
    if (itemWalletAddress && itemWalletAddress !== (event.walletAddress?.toLowerCase() ?? "")) continue;
    if (itemWalletId && profile?.id !== itemWalletId) continue;
    if (itemSymbol && event.asset && itemSymbol !== event.asset) continue;

    await db.insert(alertsTable).values({
      userId: row.watchlist.userId,
      type: event.eventType === "close_position" ? "trader_close" : "trader_open",
      title: event.title,
      body: event.body,
      payload: { ...event.payload, watchlistId: row.watchlist.id, watchlistKind: row.watchlist.kind },
    });

    await dispatchNotification({
      userId: row.watchlist.userId,
      title: event.title,
      body: event.body,
      payload: { ...event.payload, watchlistId: row.watchlist.id, watchlistKind: row.watchlist.kind },
    });
  }
}

export async function evaluateAlertEvent(event: AlertEvent) {
  try {
    const rules = await db.select().from(alertRulesTable)
      .where(and(eq(alertRulesTable.isEnabled, true), eq(alertRulesTable.eventType, event.eventType)));

    for (const rule of rules) {
      const walletProfileId = event.walletAddress
        ? (await db.query.walletProfilesTable.findFirst({
            where: eq(walletProfilesTable.walletAddress, event.walletAddress.toLowerCase()),
          }))?.id ?? null
        : null;

      if (!matchesRuleFilters(rule.filters, event, walletProfileId)) continue;
      await alertInbox(rule.userId, rule.id, event);
    }

    if (event.subjectType === "wallet") {
      await autoWatchlistMatches(event);
    }
  } catch (err) {
    logger.warn({ err, eventType: event.eventType }, "alert_engine.evaluate_failed");
  }
}

export async function listAlertRules(userId: number) {
  return db.select().from(alertRulesTable).where(eq(alertRulesTable.userId, userId));
}

export async function upsertAlertRule(userId: number, input: {
  id?: number;
  name: string;
  scope: "wallet" | "market" | "copy" | "leaderboard";
  eventType: "open_position" | "close_position" | "big_pnl" | "whale" | "leaderboard_shift" | "price_move" | "trade_context" | "signal";
  filters: Record<string, unknown>;
  isEnabled?: boolean;
}) {
  if (input.id) {
    const [updated] = await db.update(alertRulesTable)
      .set({
        name: input.name,
        scope: input.scope,
        eventType: input.eventType,
        filters: input.filters as unknown as Record<string, unknown>,
        isEnabled: input.isEnabled ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRulesTable.id, input.id), eq(alertRulesTable.userId, userId)))
      .returning();
    return updated ?? null;
  }
  const [created] = await db.insert(alertRulesTable).values({
    userId,
    name: input.name,
    scope: input.scope,
    eventType: input.eventType,
    filters: input.filters as unknown as Record<string, unknown>,
    isEnabled: input.isEnabled ?? true,
  }).returning();
  return created ?? null;
}

export async function listWatchlists(userId: number) {
  return db.select().from(watchlistsTable).where(eq(watchlistsTable.userId, userId));
}

export async function upsertWatchlist(userId: number, input: {
  id?: number;
  name: string;
  kind: "my_wallets" | "my_market" | "copy_candidates" | "top_performers";
  isDefault?: boolean;
  settings?: Record<string, unknown>;
}) {
  if (input.id) {
    const [updated] = await db.update(watchlistsTable)
      .set({
        name: input.name,
        kind: input.kind,
        isDefault: input.isDefault ?? false,
        settings: input.settings ?? {},
        updatedAt: new Date(),
      })
      .where(and(eq(watchlistsTable.id, input.id), eq(watchlistsTable.userId, userId)))
      .returning();
    return updated ?? null;
  }
  const [created] = await db.insert(watchlistsTable).values({
    userId,
    name: input.name,
    kind: input.kind,
    isDefault: input.isDefault ?? false,
    settings: input.settings ?? {},
  }).returning();
  return created ?? null;
}
