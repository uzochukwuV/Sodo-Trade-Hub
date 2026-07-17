import { db, tradersTable, walletProfilesTable, walletPositionsTable, walletScoresTable, walletAssetStatsTable, walletVerificationEventsTable, walletTradeFillsTable } from "@workspace/db";
import { eq, desc, and, sql, inArray, ilike, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { SodexPosition } from "./leaderboard-tracker";
import type { TraderForIngest } from "./position-ingest";
import { scoreWalletPositions } from "./wallet-scoring";

export type WalletIntelSummary = {
  walletAddress: string;
  profileId: number;
  traderId: number | null;
  score: number;
  tier: string;
  tradeCount: number;
  totalPnlUsd: number;
  winRate: number;
  avgLeverage: number;
  updatedAt: string;
};

export async function upsertWalletProfile(opts: {
  walletAddress: string;
  traderId?: number | null;
  displayName?: string | null;
  handle?: string | null;
  isAutoDiscovered?: boolean;
  isVerified?: boolean;
}) {
  const walletAddress = opts.walletAddress.toLowerCase();
  const existing = await db.query.walletProfilesTable.findFirst({
    where: eq(walletProfilesTable.walletAddress, walletAddress),
  });

  if (existing) {
    const [updated] = await db.update(walletProfilesTable)
      .set({
        traderId: opts.traderId ?? existing.traderId ?? null,
        displayName: opts.displayName ?? existing.displayName,
        handle: opts.handle ?? existing.handle,
        isAutoDiscovered: opts.isAutoDiscovered ?? existing.isAutoDiscovered,
        isVerified: opts.isVerified ?? existing.isVerified,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(walletProfilesTable.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db.insert(walletProfilesTable).values({
    walletAddress,
    traderId: opts.traderId ?? null,
    displayName: opts.displayName ?? null,
    handle: opts.handle ?? null,
    isAutoDiscovered: opts.isAutoDiscovered ?? false,
    isVerified: opts.isVerified ?? false,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  }).returning();
  return created;
}

function round2(n: number): string {
  return n.toFixed(2);
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferClosedStatus(p: SodexPosition): "closed" | "hit" | "stopped" {
  const pnl = parseFloat(p.realizedPnL || "0");
  return pnl > 0 ? "hit" : "stopped";
}

function scoreTier(score: number): string {
  if (score >= 85) return "DIAMOND";
  if (score >= 70) return "GOLD";
  if (score >= 50) return "SILVER";
  return "BRONZE";
}

async function syncPositionArtifacts(profileId: number, trader: TraderForIngest, position: SodexPosition) {
  const notional = parseFloat(position.avgEntryPrice || "0") * parseFloat(position.cumClosedSize || position.size || "0");
  const isClosed = !position.active && parseFloat(position.cumClosedSize || "0") > 0;
  const status = isClosed ? inferClosedStatus(position) : "open";
  const pnlUsd = parseFloat(position.realizedPnL || "0");
  const entry = parseFloat(position.avgEntryPrice || "0");
  const exit = parseFloat(position.avgClosePrice || "0");
  const openedAt = position.createdAt ? new Date(position.createdAt) : null;
  const closedAt = position.updatedAt ? new Date(position.updatedAt) : null;

  await db.insert(walletVerificationEventsTable).values({
    walletProfileId: profileId,
    sourceType: "sodex_positions_history",
    sourceId: String(position.id),
    sodexPositionId: String(position.id),
    status: "verified",
    evidence: {
      traderId: trader.id,
      username: trader.username,
      symbol: position.symbol,
      side: position.positionSide,
      realizedPnL: pnlUsd,
      active: position.active,
    },
    verifiedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(walletPositionsTable).values({
    walletProfileId: profileId,
    sodexPositionId: String(position.id),
    sodexTradeId: isClosed ? String(position.id) : null,
    symbol: position.symbol.replace("-USD", "/USDT"),
    side: position.positionSide,
    leverage: position.leverage,
    status,
    openedAt,
    closedAt,
    entryPrice: entry.toFixed(8),
    exitPrice: isClosed ? exit.toFixed(8) : null,
    pnlUsd: isClosed ? pnlUsd.toFixed(2) : null,
    pnlPct: isClosed && notional > 0 ? ((pnlUsd / notional) * 100 * position.leverage).toFixed(4) : null,
    notionalUsd: notional > 0 ? notional.toFixed(2) : null,
    isVerified: true,
    isOnChainVerified: true,
    source: "sodex",
    raw: position as unknown as Record<string, unknown>,
  }).onConflictDoUpdate({
    target: [walletPositionsTable.walletProfileId, walletPositionsTable.sodexPositionId],
    set: {
      status,
      closedAt,
      entryPrice: entry.toFixed(8),
      exitPrice: isClosed ? exit.toFixed(8) : null,
      pnlUsd: isClosed ? pnlUsd.toFixed(2) : null,
      pnlPct: isClosed && notional > 0 ? ((pnlUsd / notional) * 100 * position.leverage).toFixed(4) : null,
      notionalUsd: notional > 0 ? notional.toFixed(2) : null,
      isVerified: true,
      isOnChainVerified: true,
      raw: position as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    },
  });

  const syntheticFillPrice = isClosed ? exit || entry : entry;
  await db.insert(walletTradeFillsTable).values({
    walletProfileId: profileId,
    sodexTradeId: String(position.id),
    sodexPositionId: String(position.id),
    symbol: position.symbol.replace("-USD", "/USDT"),
    side: position.positionSide,
    price: syntheticFillPrice.toFixed(8),
    qty: Math.max(parseFloat(position.cumClosedSize || position.size || "0"), 0.00000001).toFixed(8),
    ts: closedAt ?? openedAt ?? new Date(),
    raw: position as unknown as Record<string, unknown>,
  }).onConflictDoNothing();
}

async function recomputeAssetStats(profileId: number) {
  const rows = await db.select({
    symbol: walletPositionsTable.symbol,
    tradeCount: sql<number>`count(*)`,
    pnlUsd: sql<string>`coalesce(sum(${walletPositionsTable.pnlUsd}::numeric), 0)`,
    winCount: sql<number>`sum(case when ${walletPositionsTable.pnlUsd}::numeric > 0 then 1 else 0 end)`,
    avgLeverage: sql<string>`coalesce(avg(${walletPositionsTable.leverage}::numeric), 0)`,
    avgHoldMinutes: sql<string>`coalesce(avg(extract(epoch from (${walletPositionsTable.closedAt} - ${walletPositionsTable.openedAt})) / 60), 0)`,
    maxDrawdownUsd: sql<string>`coalesce(min(${walletPositionsTable.pnlUsd}::numeric), 0)`,
    slippageUsd: sql<string>`0`,
    lastTradeAt: sql<Date | null>`max(${walletPositionsTable.closedAt})`,
  }).from(walletPositionsTable)
    .where(and(eq(walletPositionsTable.walletProfileId, profileId), inArray(walletPositionsTable.status, ["closed", "hit", "stopped"])))
    .groupBy(walletPositionsTable.symbol);

  await db.delete(walletAssetStatsTable).where(eq(walletAssetStatsTable.walletProfileId, profileId));

  for (const row of rows) {
    const tradeCount = Number(row.tradeCount ?? 0);
    const winCount = Number(row.winCount ?? 0);
    const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
    await db.insert(walletAssetStatsTable).values({
      walletProfileId: profileId,
      symbol: row.symbol,
      tradeCount,
      pnlUsd: row.pnlUsd ?? "0",
      winRate: round2(winRate),
      avgLeverage: row.avgLeverage ?? "0",
      avgHoldMinutes: row.avgHoldMinutes ?? "0",
      maxDrawdownUsd: row.maxDrawdownUsd ?? "0",
      slippageUsd: row.slippageUsd ?? "0",
      lastTradeAt: asDate(row.lastTradeAt),
      updatedAt: new Date(),
    });
  }
}

async function recomputeWalletScore(profileId: number) {
  const positions = await db.select().from(walletPositionsTable).where(eq(walletPositionsTable.walletProfileId, profileId));
  const score = scoreWalletPositions(positions);

  await db.insert(walletScoresTable).values({
    walletProfileId: profileId,
    compositeScore: round2(score.compositeScore),
    qualityScore: round2(score.profitabilityScore),
    consistencyScore: round2(score.consistencyScore),
    timingScore: round2(score.leverageDisciplineScore),
    specializationScore: round2(score.specializationScore),
    tier: score.grade,
    confidence: round2(score.confidence),
    rationale: score.rationale,
    features: score.features,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [walletScoresTable.walletProfileId],
    set: {
      compositeScore: round2(score.compositeScore),
      qualityScore: round2(score.profitabilityScore),
      consistencyScore: round2(score.consistencyScore),
      timingScore: round2(score.leverageDisciplineScore),
      specializationScore: round2(score.specializationScore),
      tier: score.grade,
      confidence: round2(score.confidence),
      rationale: score.rationale,
      features: score.features,
      updatedAt: new Date(),
    },
  });
}

export async function recordWalletIntelligence(trader: TraderForIngest, position: SodexPosition) {
  const profile = await upsertWalletProfile({
    walletAddress: trader.walletAddress ?? "",
    traderId: trader.id,
    displayName: trader.username,
    handle: trader.username.toLowerCase(),
    isAutoDiscovered: true,
    isVerified: true,
  });

  try {
    await syncPositionArtifacts(profile.id, trader, position);
    await recomputeAssetStats(profile.id);
    await recomputeWalletScore(profile.id);
  } catch (err) {
    logger.warn({ err, trader: trader.username, wallet: trader.walletAddress, positionId: position.id }, "wallet intelligence sync failed");
  }
}

export async function refreshWalletIntelligenceForTrader(trader: TraderForIngest, positions: SodexPosition[]) {
  const profile = await upsertWalletProfile({
    walletAddress: trader.walletAddress ?? "",
    traderId: trader.id,
    displayName: trader.username,
    handle: trader.username.toLowerCase(),
    isAutoDiscovered: true,
    isVerified: true,
  });

  for (const position of positions) {
    await syncPositionArtifacts(profile.id, trader, position);
  }
  await recomputeAssetStats(profile.id);
  await recomputeWalletScore(profile.id);
}

export async function getWalletIntelByAddress(walletAddress: string): Promise<WalletIntelSummary | null> {
  const profile = await db.query.walletProfilesTable.findFirst({
    where: eq(walletProfilesTable.walletAddress, walletAddress.toLowerCase()),
  });
  if (!profile) return null;

  const [score] = await db.select().from(walletScoresTable).where(eq(walletScoresTable.walletProfileId, profile.id)).orderBy(desc(walletScoresTable.updatedAt)).limit(1);
  const positions = await db.select().from(walletPositionsTable).where(eq(walletPositionsTable.walletProfileId, profile.id));
  const closed = positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));
  const totalPnl = closed.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0);
  const wins = closed.filter(p => Number(p.pnlUsd ?? 0) > 0).length;
  const avgLeverage = closed.length > 0 ? closed.reduce((sum, p) => sum + Number(p.leverage ?? 0), 0) / closed.length : 0;

  return {
    walletAddress: profile.walletAddress,
    profileId: profile.id,
    traderId: profile.traderId ?? null,
    score: Number(score?.compositeScore ?? 0),
    tier: score?.tier ?? "BRONZE",
    tradeCount: closed.length,
    totalPnlUsd: totalPnl,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
    avgLeverage,
    updatedAt: String(score?.updatedAt ?? profile.updatedAt ?? new Date().toISOString()),
  };
}

export async function listWalletIntel(limit = 50, search?: string) {
  const whereClause = search
    ? or(
        ilike(walletProfilesTable.walletAddress, `%${search}%`),
        ilike(walletProfilesTable.displayName, `%${search}%`),
      )
    : undefined;

  const rows = await db.select({
    profile: walletProfilesTable,
    score: walletScoresTable,
  })
    .from(walletProfilesTable)
    .leftJoin(walletScoresTable, eq(walletProfilesTable.id, walletScoresTable.walletProfileId))
    .where(whereClause)
    .orderBy(desc(walletScoresTable.compositeScore), desc(walletProfilesTable.lastSeenAt))
    .limit(limit);

  return rows.map(({ profile, score }) => ({
    ...profile,
    score: Number(score?.compositeScore ?? 0),
    tier: score?.tier ?? "BRONZE",
    qualityScore: Number(score?.qualityScore ?? 0),
    consistencyScore: Number(score?.consistencyScore ?? 0),
    timingScore: Number(score?.timingScore ?? 0),
    specializationScore: Number(score?.specializationScore ?? 0),
  }));
}
