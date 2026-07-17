import {
  computeMetrics,
  fetchAccountTrades,
  fetchFundings,
  fetchLeaderboard,
  fetchOrders,
  fetchPositions,
  type LeaderboardItem,
  type SodexFunding,
  type SodexOrder,
  type SodexPosition,
  type SodexUserTrade,
} from "./leaderboard-tracker";
import { explainWalletHistory } from "./wallet-history-explainer";
import { scoreWalletPositions, type ScorablePosition } from "./wallet-scoring";

export type LiveLeaderboardWallet = {
  rank: number;
  walletAddress: string;
  accountId: number;
  windowType: string;
  pnlUsd: number;
  volumeUsd: number;
};

function toLiveLeaderboardWallet(item: LeaderboardItem): LiveLeaderboardWallet {
  return {
    rank: item.rank,
    walletAddress: item.wallet_address.toLowerCase(),
    accountId: item.account_id,
    windowType: item.window_type,
    pnlUsd: Number(item.pnl_usd),
    volumeUsd: Number(item.volume_usd),
  };
}

export function normalizeSodexPosition(p: SodexPosition): ScorablePosition & {
  sodexPositionId: string;
  entryPrice: string;
  exitPrice: string | null;
  pnlPct: string | null;
  raw: SodexPosition;
} {
  const isClosed = !p.active && Number(p.cumClosedSize || "0") > 0;
  const entry = Number(p.avgEntryPrice || 0);
  const exit = Number(p.avgClosePrice || 0);
  const qty = Number(p.cumClosedSize || p.size || 0);
  const pnl = Number(p.realizedPnL || 0);
  const notional = entry * qty;
  return {
    id: p.id,
    sodexPositionId: String(p.id),
    symbol: p.symbol.replace("-USD", "/USDT"),
    side: p.positionSide,
    leverage: p.leverage,
    status: isClosed ? (pnl >= 0 ? "hit" : "stopped") : "open",
    openedAt: p.createdAt ? new Date(p.createdAt) : null,
    closedAt: isClosed && p.updatedAt ? new Date(p.updatedAt) : null,
    entryPrice: entry.toFixed(8),
    exitPrice: isClosed ? exit.toFixed(8) : null,
    pnlUsd: isClosed ? pnl.toFixed(2) : null,
    pnlPct: isClosed && notional > 0 ? ((pnl / notional) * 100 * p.leverage).toFixed(4) : null,
    notionalUsd: notional > 0 ? notional.toFixed(2) : null,
    raw: p,
  };
}

type TradeThesisInput = {
  walletAddress: string;
  score: ReturnType<typeof scoreWalletPositions> | null;
  positions: ReturnType<typeof normalizeSodexPosition>[];
  orders: SodexOrder[];
  trades: SodexUserTrade[];
  fundings: SodexFunding[];
};

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function avgHoldHours(positions: TradeThesisInput["positions"]) {
  const closed = positions.filter(p => p.openedAt && p.closedAt);
  if (closed.length === 0) return 0;
  const total = closed.reduce((sum, p) => sum + (new Date(p.closedAt!).getTime() - new Date(p.openedAt!).getTime()) / 3_600_000, 0);
  return total / closed.length;
}

function buildTradeThesis(input: TradeThesisInput) {
  const closed = input.positions.filter(p => ["closed", "hit", "stopped"].includes(p.status));
  const latest = closed[0] ?? null;
  const latestSymbol = latest?.symbol ?? String(input.orders[0]?.["symbol"] ?? input.trades[0]?.["symbol"] ?? "UNKNOWN").replace("-USD", "/USDT");
  const latestSide = latest?.side ?? String(input.orders[0]?.["side"] ?? "UNKNOWN");
  const latestEntry = num(latest?.entryPrice ?? input.orders[0]?.["price"] ?? input.trades[0]?.["price"]);
  const latestNotional = num(latest?.notionalUsd);
  const wins = closed.filter(p => num(p.pnlUsd) > 0);
  const losses = closed.filter(p => num(p.pnlUsd) < 0);
  const similar = closed.filter(p => p.symbol === latestSymbol || p.side === latestSide);
  const similarReturns = similar.map(p => num(p.pnlPct));
  const avgReturn = similarReturns.length > 0 ? similarReturns.reduce((a, b) => a + b, 0) / similarReturns.length : 0;
  const avgDrawdown = losses.length > 0 ? losses.reduce((sum, p) => sum + num(p.pnlPct), 0) / losses.length : 0;
  const holdHours = avgHoldHours(closed);
  const symbols = new Set(closed.map(p => p.symbol));
  const memeSymbols = ["DOGE/USDT", "PEPE/USDT", "BONK/USDT", "WIF/USDT", "SHIB/USDT"];
  const memeCount = closed.filter(p => memeSymbols.includes(p.symbol)).length;
  const recentOrders = input.orders.slice(0, 20);
  const filledOrders = recentOrders.filter(o => String(o["status"] ?? "").toUpperCase() === "FILLED").length;
  const canceledOrders = recentOrders.filter(o => String(o["status"] ?? "").toUpperCase() === "CANCELED").length;
  const fundingNet = input.fundings.reduce((sum, f) => sum + num(f["fundingFee"]), 0);
  const confidence = input.score
    ? Math.max(1, Math.min(10, input.score.compositeScore / 10 * 0.75 + input.score.confidence / 10 * 0.25))
    : 1;
  const positionWeightText = latestNotional > 0
    ? `Latest tracked position size was ${money(latestNotional)} notional.`
    : "Current portfolio weight is not available from SoDEX account history.";
  const entryLow = latestEntry > 0 ? latestEntry * 0.995 : 0;
  const entryHigh = latestEntry > 0 ? latestEntry * 1.005 : 0;
  const action = input.score && input.score.compositeScore >= 76 && input.score.winRate >= 55
    ? "Worth monitoring. Treat this wallet as a qualified signal source, not an automatic copy."
    : input.score && input.score.compositeScore >= 62
      ? "Monitor only. Wait for confirmation from future entries before copying."
      : "Low conviction. Use as context, not as a trade trigger.";
  const risk = losses.length > 0
    ? `Historical losing trades averaged ${fmtPct(avgDrawdown)} with max single-trade loss of ${money(input.score?.maxDrawdownUsd ?? 0)}.`
    : "No losing closed positions in fetched history, but sample size may be too small.";

  return {
    wallet: input.walletAddress,
    score: input.score ? Math.round(input.score.compositeScore) : 0,
    headline: latest
      ? `${latest.side} ${latest.symbol} thesis based on ${closed.length} closed SoDEX positions.`
      : "No closed position thesis yet. Monitoring orders, executions, and funding context only.",
    whyThisMatters: [
      input.score ? `${input.score.winRate.toFixed(1)}% win rate across ${input.score.tradeCount} closed positions.` : "No score available yet.",
      input.score ? `${money(input.score.totalPnlUsd)} tracked net PnL with ${input.score.avgLeverage.toFixed(1)}x average leverage.` : "PnL history unavailable.",
      memeCount === 0 ? "No meme-heavy behavior in fetched closed-position history." : `${memeCount} fetched closed positions were meme-asset trades.`,
      holdHours > 0 ? `Average holding period is ${(holdHours / 24).toFixed(1)} days.` : "Average holding period is unavailable.",
      positionWeightText,
      `${filledOrders} of the latest ${recentOrders.length} fetched orders were filled; ${canceledOrders} were canceled.`,
      `Fetched funding history net: ${money(fundingNet)}.`,
    ],
    confidence: Number(confidence.toFixed(1)),
    historicalSimilarity: {
      sampleSize: similar.length,
      averageReturnPct: Number(avgReturn.toFixed(2)),
      averageMaxDrawdownPct: Number(avgDrawdown.toFixed(2)),
      basis: latest ? `Same symbol or same side as latest tracked ${latest.side} ${latest.symbol}.` : "No latest closed position available.",
    },
    suggestedAction: {
      summary: action,
      idealEntryZone: latestEntry > 0 ? `${entryLow.toFixed(4)} - ${entryHigh.toFixed(4)}` : "Wait for next clear entry price.",
      risk,
      invalidation: latestEntry > 0 ? `Reassess if price moves more than 2% against the inferred entry around ${latestEntry.toFixed(4)}.` : "Reassess after the next filled order.",
    },
    caveats: [
      "This is a structured intelligence memo, not financial advice.",
      "SoDEX account history may omit external portfolio context and off-platform hedges.",
      symbols.size > 0 ? `Fetched history covers ${symbols.size} symbols.` : "Fetched history has no closed-position symbols.",
    ],
  };
}

export async function getLiveLeaderboard(opts: {
  window?: "24H" | "7D" | "30D" | "ALL_TIME";
  pageSize?: number;
}) {
  const requested = opts.pageSize ?? 50;
  const pageSize = requested <= 10 ? 10 : requested <= 20 ? 20 : 50;
  const items = await fetchLeaderboard(opts.window ?? "7D", pageSize);
  return items.map(toLiveLeaderboardWallet);
}

export async function analyzeLiveWallet(walletAddress: string, limit = 200, accountId?: string | number | null) {
  const address = walletAddress.toLowerCase();
  let positions: SodexPosition[] = [];
  let orders: SodexOrder[] = [];
  let trades: SodexUserTrade[] = [];
  let fundings: SodexFunding[] = [];

  try {
    positions = await fetchPositions(address, limit, { accountId });
  } catch {
    if (accountId !== undefined && accountId !== null && String(accountId).trim()) {
      try {
        positions = await fetchPositions(address, limit);
      } catch {
        positions = [];
      }
    }
  }

  const [ordersResult, tradesResult, fundingsResult] = await Promise.allSettled([
    fetchOrders(address, Math.min(limit, 500), { accountId }),
    fetchAccountTrades(address, Math.min(limit, 1000), { accountId }),
    fetchFundings(address, Math.min(limit, 1000), { accountId }),
  ]);
  if (ordersResult.status === "fulfilled") orders = ordersResult.value;
  if (tradesResult.status === "fulfilled") trades = tradesResult.value;
  if (fundingsResult.status === "fulfilled") fundings = fundingsResult.value;

  const normalized = positions.map(normalizeSodexPosition)
    .sort((a, b) => new Date(b.closedAt ?? b.openedAt ?? 0).getTime() - new Date(a.closedAt ?? a.openedAt ?? 0).getTime());
  if (normalized.length === 0) {
    const thesis = buildTradeThesis({ walletAddress: address, score: null, positions: normalized, orders, trades, fundings });
    return {
      profile: {
        walletAddress: address,
        displayName: `${address.slice(0, 8)}...${address.slice(-6)}`,
        handle: null,
        traderId: null,
        status: "live",
        isAutoDiscovered: false,
        isVerified: false,
        firstSeenAt: null,
        lastSeenAt: null,
        notes: null,
      },
      score: {
        compositeScore: "0.00",
        qualityScore: "0.00",
        consistencyScore: "0.00",
        timingScore: "0.00",
        specializationScore: "0.00",
        tier: "NO_HISTORY",
        confidence: "0.00",
        rationale: "SoDEX leaderboard returned this wallet, but positions/history returned no trades for immediate analysis.",
        features: {},
      },
      summary: {
        walletAddress: address,
        profileId: 0,
        score: 0,
        tier: "NO_HISTORY",
        tradeCount: 0,
        totalPnlUsd: 0,
        winRate: 0,
        avgLeverage: 0,
        traderId: null,
        updatedAt: new Date().toISOString(),
      },
      explanation: {
        headline: "No position history returned by SoDEX for this leaderboard wallet.",
        strengths: ["Leaderboard PnL is visible, but per-position history is unavailable from the account history endpoint."],
        risks: ["Do not copy from this app until positions/history returns enough trades to score."],
        behavior: ["Open another leaderboard wallet or try a different leaderboard window."],
        recentTrades: [],
      },
      positions: normalized,
      orders,
      trades,
      fundings,
      thesis,
    };
  }
  const score = scoreWalletPositions(normalized);
  const metrics = computeMetrics(positions);
  const explanation = explainWalletHistory({ tier: score.grade }, normalized);
  const thesis = buildTradeThesis({ walletAddress: address, score, positions: normalized, orders, trades, fundings });

  return {
    profile: {
      walletAddress: address,
      displayName: `${address.slice(0, 8)}...${address.slice(-6)}`,
      handle: null,
      traderId: null,
      status: "live",
      isAutoDiscovered: false,
      isVerified: true,
      firstSeenAt: metrics.firstSeen?.toISOString() ?? null,
      lastSeenAt: metrics.lastSeen?.toISOString() ?? null,
      notes: null,
    },
    score: {
      compositeScore: score.compositeScore.toFixed(2),
      qualityScore: score.profitabilityScore.toFixed(2),
      consistencyScore: score.consistencyScore.toFixed(2),
      timingScore: score.leverageDisciplineScore.toFixed(2),
      specializationScore: score.specializationScore.toFixed(2),
      tier: score.grade,
      confidence: score.confidence.toFixed(2),
      rationale: score.rationale,
      features: score.features,
    },
    summary: {
      walletAddress: address,
      profileId: 0,
      score: score.compositeScore,
      tier: score.grade,
      tradeCount: score.tradeCount,
      totalPnlUsd: score.totalPnlUsd,
      winRate: score.winRate,
      avgLeverage: score.avgLeverage,
      traderId: null,
      updatedAt: new Date().toISOString(),
    },
    explanation,
    positions: normalized,
    orders,
    trades,
    fundings,
    thesis,
  };
}

export type LiveHighImpactTrade = {
  id: string;
  walletAddress: string;
  accountId: number;
  rank: number;
  windowType: string;
  leaderboardPnlUsd: number;
  symbol: string;
  side: string;
  leverage: number;
  pnlUsd: number;
  pnlPct: number | null;
  notionalUsd: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  openedAt: string | null;
  closedAt: string | null;
  sodexPositionId: string;
  impact: "profit" | "loss";
};

export async function getLiveHighImpactTrades(opts: {
  window?: "24H" | "7D" | "30D" | "ALL_TIME";
  leaderboardSize?: number;
  limit?: number;
  minProfitUsd?: number;
  minLossUsd?: number;
  positionLimit?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const minProfitUsd = Math.max(opts.minProfitUsd ?? 500, 0);
  const minLossUsd = Math.max(opts.minLossUsd ?? 500, 0);
  const leaderboard = await getLiveLeaderboard({
    window: opts.window ?? "7D",
    pageSize: opts.leaderboardSize ?? 20,
  });

  const analyses = await Promise.allSettled(
    leaderboard.map(wallet => analyzeLiveWallet(wallet.walletAddress, opts.positionLimit ?? 100, wallet.accountId)
      .then(analysis => ({ wallet, analysis }))),
  );

  const trades: LiveHighImpactTrade[] = [];
  for (const result of analyses) {
    if (result.status !== "fulfilled") continue;
    const { wallet, analysis } = result.value;
    for (const position of analysis.positions) {
      if (!["closed", "hit", "stopped"].includes(position.status)) continue;
      const pnlUsd = Number(position.pnlUsd ?? 0);
      const isLargeProfit = pnlUsd >= minProfitUsd;
      const isLargeLoss = pnlUsd <= -minLossUsd;
      if (!isLargeProfit && !isLargeLoss) continue;

      trades.push({
        id: `${wallet.accountId}:${position.sodexPositionId}`,
        walletAddress: wallet.walletAddress,
        accountId: wallet.accountId,
        rank: wallet.rank,
        windowType: wallet.windowType,
        leaderboardPnlUsd: wallet.pnlUsd,
        symbol: position.symbol,
        side: position.side,
        leverage: position.leverage,
        pnlUsd,
        pnlPct: position.pnlPct === null ? null : Number(position.pnlPct),
        notionalUsd: position.notionalUsd === null ? null : Number(position.notionalUsd),
        entryPrice: position.entryPrice === null ? null : Number(position.entryPrice),
        exitPrice: position.exitPrice === null ? null : Number(position.exitPrice),
        openedAt: position.openedAt ? new Date(position.openedAt).toISOString() : null,
        closedAt: position.closedAt ? new Date(position.closedAt).toISOString() : null,
        sodexPositionId: position.sodexPositionId,
        impact: pnlUsd >= 0 ? "profit" : "loss",
      });
    }
  }

  trades.sort((a, b) => {
    const byTime = new Date(b.closedAt ?? b.openedAt ?? 0).getTime() - new Date(a.closedAt ?? a.openedAt ?? 0).getTime();
    if (byTime !== 0) return byTime;
    return Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd);
  });

  return {
    items: trades.slice(0, limit),
    total: trades.length,
    scannedWallets: leaderboard.length,
    thresholds: { minProfitUsd, minLossUsd },
    window: opts.window ?? "7D",
  };
}

export function backtestNormalizedPositions(positions: ScorablePosition[], opts: {
  windowDays: number;
  startingBalanceUsd: number;
  tradeSizeUsd: number;
  startDate?: string | Date | null;
}) {
  const since = opts.startDate
    ? new Date(opts.startDate).getTime()
    : Date.now() - opts.windowDays * 86_400_000;
  const closed = positions
    .filter(p => ["closed", "hit", "stopped"].includes(p.status) && p.closedAt && new Date(p.closedAt).getTime() >= since)
    .sort((a, b) => new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime());
  let equity = opts.startingBalanceUsd;
  let peak = opts.startingBalanceUsd;
  let maxDrawdownUsd = 0;
  let wins = 0;
  let longestLosingStreak = 0;
  let currentLosingStreak = 0;
  let totalHoldMinutes = 0;
  let holdCount = 0;
  const returns: number[] = [];
  const monthlyPnl = new Map<string, number>();
  const symbolPnl = new Map<string, number>();
  const equityCurve: Array<{ timestamp: string; equity: number; pnlUsd: number; symbol: string; side: string }> = [];

  for (const p of closed) {
    const pnl = Number(p.pnlUsd ?? 0);
    const notional = Number(p.notionalUsd ?? 0);
    const scaled = notional > 0 ? pnl * (opts.tradeSizeUsd / notional) : pnl;
    equity += scaled;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
    returns.push(scaled / opts.startingBalanceUsd);
    if (scaled > 0) {
      wins++;
      currentLosingStreak = 0;
    } else if (scaled < 0) {
      currentLosingStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
    }

    const closedAt = new Date(p.closedAt!);
    const month = `${closedAt.getUTCFullYear()}-${String(closedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyPnl.set(month, (monthlyPnl.get(month) ?? 0) + scaled);
    symbolPnl.set(p.symbol, (symbolPnl.get(p.symbol) ?? 0) + scaled);
    if (p.openedAt) {
      const holdMinutes = (closedAt.getTime() - new Date(p.openedAt).getTime()) / 60_000;
      if (Number.isFinite(holdMinutes) && holdMinutes > 0) {
        totalHoldMinutes += holdMinutes;
        holdCount++;
      }
    }
    equityCurve.push({
      timestamp: closedAt.toISOString(),
      equity: Number(equity.toFixed(2)),
      pnlUsd: Number(scaled.toFixed(2)),
      symbol: p.symbol,
      side: p.side,
    });
  }
  const copyPnlUsd = equity - opts.startingBalanceUsd;
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1)
    : 0;
  const sharpe = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(Math.min(returns.length, 252)) : 0;
  const monthlyReturns = [...monthlyPnl.entries()]
    .map(([month, pnlUsd]) => ({
      month,
      pnlUsd: Number(pnlUsd.toFixed(2)),
      returnPct: Number(((pnlUsd / opts.startingBalanceUsd) * 100).toFixed(2)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const worstMonth = monthlyReturns.reduce<typeof monthlyReturns[number] | null>((worst, item) => {
    if (!worst || item.returnPct < worst.returnPct) return item;
    return worst;
  }, null);
  const orderedSymbols = [...symbolPnl.entries()].map(([symbol, pnlUsd]) => ({ symbol, pnlUsd })).sort((a, b) => b.pnlUsd - a.pnlUsd);

  return {
    walletAddress: "",
    windowDays: opts.windowDays,
    startDate: new Date(since).toISOString(),
    startingBalanceUsd: opts.startingBalanceUsd,
    tradeSizeUsd: opts.tradeSizeUsd,
    endingBalanceUsd: Number(equity.toFixed(2)),
    copyPnlUsd: Number(copyPnlUsd.toFixed(2)),
    copyReturnPct: Number(((copyPnlUsd / opts.startingBalanceUsd) * 100).toFixed(2)),
    maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(2)),
    maxDrawdownPct: Number(((maxDrawdownUsd / opts.startingBalanceUsd) * 100).toFixed(2)),
    winRate: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(2)) : 0,
    tradeCount: closed.length,
    bestSymbol: orderedSymbols[0]?.symbol ?? null,
    worstSymbol: orderedSymbols.at(-1)?.symbol ?? null,
    avgHoldMinutes: holdCount > 0 ? Number((totalHoldMinutes / holdCount).toFixed(2)) : 0,
    longestLosingStreak,
    worstMonth,
    sharpe: Number(sharpe.toFixed(2)),
    monthlyReturns,
    equityCurve,
    symbolAttribution: orderedSymbols.map(item => ({
      symbol: item.symbol,
      pnlUsd: Number(item.pnlUsd.toFixed(2)),
      returnPct: Number(((item.pnlUsd / opts.startingBalanceUsd) * 100).toFixed(2)),
    })),
  };
}
