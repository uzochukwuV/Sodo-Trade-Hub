import type { walletScoresTable } from "@workspace/db";
import type { ScorablePosition } from "./wallet-scoring";

type WalletScore = typeof walletScoresTable.$inferSelect;

function money(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function minutesBetween(a: Date | string | null, b: Date | string | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

export type ReadableWalletHistory = {
  headline: string;
  strengths: string[];
  risks: string[];
  behavior: string[];
  recentTrades: Array<{
    id: number;
    text: string;
    outcome: "win" | "loss" | "open";
  }>;
};

export function explainWalletHistory(score: Pick<WalletScore, "tier"> | null, positions: ScorablePosition[]): ReadableWalletHistory {
  const closed = positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));
  const wins = closed.filter(p => Number(p.pnlUsd ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((sum, p) => sum + Number(p.pnlUsd ?? 0), 0);
  const avgLev = closed.length > 0 ? closed.reduce((sum, p) => sum + Number(p.leverage ?? 0), 0) / closed.length : 0;
  const symbols = [...new Set(closed.map(p => p.symbol))];
  const holdMinutes = closed.map(p => minutesBetween(p.openedAt, p.closedAt)).filter((v): v is number => v !== null);
  const avgHold = holdMinutes.length > 0 ? holdMinutes.reduce((a, b) => a + b, 0) / holdMinutes.length : 0;
  const grade = score?.tier ?? "Avoid";

  const strengths: string[] = [];
  const risks: string[] = [];
  if (winRate >= 55) strengths.push(`Wins ${winRate.toFixed(1)}% of closed trades.`);
  if (totalPnl > 0) strengths.push(`Net profitable across tracked history: ${money(totalPnl)}.`);
  if (symbols.length <= 3 && symbols.length > 0) strengths.push(`Focused asset behavior: mainly ${symbols.slice(0, 3).join(", ")}.`);
  if (avgLev <= 12 && closed.length > 0) strengths.push(`Uses controlled leverage around ${avgLev.toFixed(1)}x.`);
  if (winRate < 50) risks.push(`Win rate is below 50%, so profitable periods may depend on a few large wins.`);
  if (avgLev > 20) risks.push(`Average leverage is high at ${avgLev.toFixed(1)}x.`);
  if (closed.length < 10) risks.push(`Small sample size: only ${closed.length} closed trades stored.`);
  if (totalPnl < 0) risks.push(`Tracked closed PnL is negative: ${money(totalPnl)}.`);

  return {
    headline: `${grade} wallet with ${closed.length} closed trades, ${winRate.toFixed(1)}% win rate, and ${money(totalPnl)} tracked PnL.`,
    strengths: strengths.length ? strengths : ["No clear edge detected yet from stored history."],
    risks: risks.length ? risks : ["No major risk flag from stored history."],
    behavior: [
      symbols.length ? `Trades ${symbols.slice(0, 5).join(", ")}.` : "No closed asset history yet.",
      avgHold > 0 ? `Average hold time is about ${avgHold >= 60 ? `${(avgHold / 60).toFixed(1)} hours` : `${avgHold.toFixed(0)} minutes`}.` : "Hold-time data is not available yet.",
      avgLev > 0 ? `Average leverage is ${avgLev.toFixed(1)}x.` : "Leverage data is not available yet.",
    ],
    recentTrades: positions.slice(0, 20).map((p, index) => {
      const pnl = Number(p.pnlUsd ?? 0);
      const status = p.status === "open" ? "open" : pnl >= 0 ? "win" : "loss";
      return {
        id: p.id ?? index,
        outcome: status,
        text: p.status === "open"
          ? `Open ${p.side} ${p.symbol} at ${p.leverage}x from $${Number(p.entryPrice ?? 0).toFixed(4)}.`
          : `Closed ${p.side} ${p.symbol} at ${p.leverage}x for ${money(pnl)}.`,
      };
    }),
  };
}
