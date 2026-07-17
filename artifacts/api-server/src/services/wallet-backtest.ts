import { db, walletBacktestsTable, walletPositionsTable, walletProfilesTable } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";

type BacktestInput = {
  walletAddress: string;
  userId?: number | null;
  windowDays?: number;
  startingBalanceUsd?: number;
  tradeSizeUsd?: number;
};

function round2(n: number): string {
  return n.toFixed(2);
}

export async function runWalletBacktest(input: BacktestInput) {
  const windowDays = Math.min(Math.max(Number(input.windowDays ?? 30), 1), 365);
  const startingBalanceUsd = Math.max(Number(input.startingBalanceUsd ?? 1000), 1);
  const tradeSizeUsd = Math.max(Number(input.tradeSizeUsd ?? 100), 1);
  const profile = await db.query.walletProfilesTable.findFirst({
    where: eq(walletProfilesTable.walletAddress, input.walletAddress.toLowerCase()),
  });
  if (!profile) throw new Error("wallet_not_found");

  const since = new Date(Date.now() - windowDays * 86_400_000);
  const positions = await db.select().from(walletPositionsTable)
    .where(and(eq(walletPositionsTable.walletProfileId, profile.id), gte(walletPositionsTable.closedAt, since)))
    .orderBy(desc(walletPositionsTable.closedAt));
  const closed = positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));

  let equity = startingBalanceUsd;
  let peak = startingBalanceUsd;
  let maxDrawdownUsd = 0;
  const bySymbol = new Map<string, number>();
  let wins = 0;
  let holdTotal = 0;
  let holdCount = 0;

  for (const p of [...closed].reverse()) {
    const notional = Number(p.notionalUsd ?? 0);
    const pnl = Number(p.pnlUsd ?? 0);
    const scaledPnl = notional > 0 ? pnl * (tradeSizeUsd / notional) : pnl;
    equity += scaledPnl;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
    bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + scaledPnl);
    if (scaledPnl > 0) wins++;
    if (p.openedAt && p.closedAt) {
      holdTotal += Math.max(0, new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()) / 60_000;
      holdCount++;
    }
  }

  const symbolRows = [...bySymbol.entries()].map(([symbol, pnlUsd]) => ({ symbol, pnlUsd })).sort((a, b) => b.pnlUsd - a.pnlUsd);
  const copyPnlUsd = equity - startingBalanceUsd;
  const copyReturnPct = (copyPnlUsd / startingBalanceUsd) * 100;
  const maxDrawdownPct = (maxDrawdownUsd / startingBalanceUsd) * 100;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const avgHoldMinutes = holdCount > 0 ? holdTotal / holdCount : 0;
  const result = {
    walletAddress: profile.walletAddress,
    windowDays,
    startingBalanceUsd,
    tradeSizeUsd,
    endingBalanceUsd: Number(round2(equity)),
    copyPnlUsd: Number(round2(copyPnlUsd)),
    copyReturnPct: Number(round2(copyReturnPct)),
    maxDrawdownUsd: Number(round2(maxDrawdownUsd)),
    maxDrawdownPct: Number(round2(maxDrawdownPct)),
    winRate: Number(round2(winRate)),
    tradeCount: closed.length,
    bestSymbol: symbolRows[0]?.symbol ?? null,
    worstSymbol: symbolRows.at(-1)?.symbol ?? null,
    avgHoldMinutes: Number(round2(avgHoldMinutes)),
    symbolBreakdown: symbolRows,
  };

  const [row] = await db.insert(walletBacktestsTable).values({
    walletProfileId: profile.id,
    userId: input.userId ?? null,
    windowDays,
    sizingMode: "fixed_notional",
    startingBalanceUsd: round2(startingBalanceUsd),
    tradeSizeUsd: round2(tradeSizeUsd),
    copyPnlUsd: round2(copyPnlUsd),
    copyReturnPct: round2(copyReturnPct),
    maxDrawdownUsd: round2(maxDrawdownUsd),
    maxDrawdownPct: round2(maxDrawdownPct),
    winRate: round2(winRate),
    tradeCount: closed.length,
    bestSymbol: result.bestSymbol,
    worstSymbol: result.worstSymbol,
    avgHoldMinutes: round2(avgHoldMinutes),
    result,
  }).returning();

  return { backtest: row, result };
}
