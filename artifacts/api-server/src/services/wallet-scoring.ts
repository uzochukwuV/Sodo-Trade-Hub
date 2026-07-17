export type ScorablePosition = {
  id?: number;
  symbol: string;
  side: string;
  leverage: number;
  status: string;
  openedAt: Date | string | null;
  closedAt: Date | string | null;
  entryPrice?: string | number | null;
  exitPrice?: string | number | null;
  pnlUsd: string | number | null;
  notionalUsd?: string | number | null;
};

export type WalletGrade = "A+" | "A" | "B" | "C" | "Avoid";

export type WalletScoreBreakdown = {
  compositeScore: number;
  grade: WalletGrade;
  profitabilityScore: number;
  consistencyScore: number;
  drawdownScore: number;
  leverageDisciplineScore: number;
  specializationScore: number;
  recencyScore: number;
  confidence: number;
  totalPnlUsd: number;
  winRate: number;
  tradeCount: number;
  avgLeverage: number;
  maxDrawdownUsd: number;
  bestSymbol: string | null;
  worstSymbol: string | null;
  rationale: string;
  features: Record<string, unknown>;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function gradeFromScore(score: number, confidence: number): WalletGrade {
  if (confidence < 35 || score < 35) return "Avoid";
  if (score >= 88 && confidence >= 70) return "A+";
  if (score >= 76) return "A";
  if (score >= 62) return "B";
  if (score >= 48) return "C";
  return "Avoid";
}

function symbolPnL(positions: ScorablePosition[]): Array<{ symbol: string; pnlUsd: number }> {
  const bySymbol = new Map<string, number>();
  for (const p of positions) {
    bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + Number(p.pnlUsd ?? 0));
  }
  return [...bySymbol.entries()].map(([symbol, pnlUsd]) => ({ symbol, pnlUsd })).sort((a, b) => b.pnlUsd - a.pnlUsd);
}

export function scoreWalletPositions(positions: ScorablePosition[], now = new Date()): WalletScoreBreakdown {
  const closed = positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));
  const wins = closed.filter(p => Number(p.pnlUsd ?? 0) > 0);
  const losses = closed.filter(p => Number(p.pnlUsd ?? 0) < 0);
  const totalPnlUsd = closed.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgLeverage = closed.length > 0 ? closed.reduce((sum, p) => sum + Number(p.leverage ?? 0), 0) / closed.length : 0;
  const maxDrawdownUsd = Math.abs(Math.min(0, ...closed.map(p => Number(p.pnlUsd ?? 0))));
  const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0) / wins.length : 0;
  const avgLossAbs = losses.length > 0 ? Math.abs(losses.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0) / losses.length) : 0;
  const profitFactor = avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? 3 : 0;
  const symbols = new Set(closed.map(p => p.symbol));
  const orderedSymbols = symbolPnL(closed);
  const latestTradeTs = Math.max(0, ...closed.map(p => p.closedAt ? new Date(p.closedAt).getTime() : 0));
  const daysSinceTrade = latestTradeTs > 0 ? (now.getTime() - latestTradeTs) / 86_400_000 : 999;

  const profitabilityScore = clamp(Math.log10(Math.max(Math.abs(totalPnlUsd), 1)) * 12 + Math.max(0, profitFactor - 1) * 12);
  const consistencyScore = clamp(winRate * 0.9 + Math.min(20, closed.length * 1.2));
  const drawdownScore = clamp(100 - Math.min(85, maxDrawdownUsd / Math.max(Math.abs(totalPnlUsd), 1) * 65));
  const leverageDisciplineScore = clamp(100 - Math.max(0, avgLeverage - 8) * 3.2);
  const specializationScore = closed.length === 0 ? 0 : clamp(95 - Math.max(0, symbols.size - 2) * 12);
  const recencyScore = clamp(100 - daysSinceTrade * 2.5);
  const confidence = clamp(Math.min(75, closed.length * 5) + (symbols.size > 0 ? 15 : 0) + (latestTradeTs > 0 ? 10 : 0));
  const compositeScore = clamp(
    profitabilityScore * 0.22 +
    consistencyScore * 0.24 +
    drawdownScore * 0.18 +
    leverageDisciplineScore * 0.14 +
    specializationScore * 0.12 +
    recencyScore * 0.10,
  );
  const grade = gradeFromScore(compositeScore, confidence);
  const bestSymbol = orderedSymbols[0]?.symbol ?? null;
  const worstSymbol = orderedSymbols.at(-1)?.symbol ?? null;

  return {
    compositeScore: round2(compositeScore),
    grade,
    profitabilityScore: round2(profitabilityScore),
    consistencyScore: round2(consistencyScore),
    drawdownScore: round2(drawdownScore),
    leverageDisciplineScore: round2(leverageDisciplineScore),
    specializationScore: round2(specializationScore),
    recencyScore: round2(recencyScore),
    confidence: round2(confidence),
    totalPnlUsd: round2(totalPnlUsd),
    winRate: round2(winRate),
    tradeCount: closed.length,
    avgLeverage: round2(avgLeverage),
    maxDrawdownUsd: round2(maxDrawdownUsd),
    bestSymbol,
    worstSymbol,
    rationale: `${grade} wallet: ${closed.length} closed trades, ${round2(winRate)}% win rate, $${round2(totalPnlUsd).toLocaleString()} net PnL, ${round2(avgLeverage)}x average leverage.`,
    features: {
      totalPnlUsd: round2(totalPnlUsd),
      winRate: round2(winRate),
      tradeCount: closed.length,
      avgLeverage: round2(avgLeverage),
      maxDrawdownUsd: round2(maxDrawdownUsd),
      profitFactor: round2(profitFactor),
      symbolCount: symbols.size,
      bestSymbol,
      worstSymbol,
      daysSinceTrade: round2(daysSinceTrade),
    },
  };
}
