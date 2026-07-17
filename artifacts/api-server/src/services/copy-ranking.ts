import { db, walletProfilesTable, walletScoresTable, walletPositionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export type CopyCandidate = {
  walletAddress: string;
  displayName: string | null;
  score: number;
  grade: string;
  confidence: number;
  totalPnlUsd: number;
  winRate: number;
  tradeCount: number;
  avgLeverage: number;
  maxDrawdownUsd: number;
  bestSymbol: string | null;
  reason: string;
};

function featureNumber(features: unknown, key: string): number {
  if (!features || typeof features !== "object") return 0;
  const value = (features as Record<string, unknown>)[key];
  return Number(value ?? 0);
}

function featureString(features: unknown, key: string): string | null {
  if (!features || typeof features !== "object") return null;
  const value = (features as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export async function listCopyCandidates(limit = 50): Promise<CopyCandidate[]> {
  const rows = await db.select({
    profile: walletProfilesTable,
    score: walletScoresTable,
  })
    .from(walletProfilesTable)
    .innerJoin(walletScoresTable, eq(walletProfilesTable.id, walletScoresTable.walletProfileId))
    .orderBy(desc(walletScoresTable.compositeScore), desc(walletScoresTable.confidence))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map(({ profile, score }) => {
    const totalPnlUsd = featureNumber(score.features, "totalPnlUsd");
    const winRate = featureNumber(score.features, "winRate");
    const tradeCount = featureNumber(score.features, "tradeCount");
    const avgLeverage = featureNumber(score.features, "avgLeverage");
    const maxDrawdownUsd = featureNumber(score.features, "maxDrawdownUsd");
    const bestSymbol = featureString(score.features, "bestSymbol");
    return {
      walletAddress: profile.walletAddress,
      displayName: profile.displayName,
      score: Number(score.compositeScore),
      grade: score.tier,
      confidence: Number(score.confidence),
      totalPnlUsd,
      winRate,
      tradeCount,
      avgLeverage,
      maxDrawdownUsd,
      bestSymbol,
      reason: `${score.tier} candidate: ${tradeCount} trades, ${winRate.toFixed(1)}% win rate, ${avgLeverage.toFixed(1)}x avg leverage.`,
    };
  });
}

export async function getWalletCandidateContext(walletProfileId: number) {
  const positions = await db.select().from(walletPositionsTable)
    .where(eq(walletPositionsTable.walletProfileId, walletProfileId))
    .orderBy(desc(walletPositionsTable.closedAt), desc(walletPositionsTable.updatedAt))
    .limit(200);
  return { positions };
}
