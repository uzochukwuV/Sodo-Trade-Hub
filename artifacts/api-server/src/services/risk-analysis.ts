import { db, tradesTable, tradersTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getMarketActivity, type MarketActivity } from "./market-activity";
import { getKlines } from "./market";

/**
 * Lightweight pre-trade risk analysis API. Answers: "if a user posts an intent
 * to {LONG|SHORT} {asset} at {entry} {leverage}x — what does our data say?"
 *
 *  - historical hit rate of similar trades (same asset+side) by tracked traders
 *  - asset realized vol (24h ATR-ish from klines)
 *  - current market sentiment (15m buy/sell ratio + funding rate)
 *  - leverage warning if > median leverage for this asset on Sodex
 *  - suggested stop-loss (entry × (1 ± 1.5 × atrPct))
 *  - confidence score 0-100 (composite)
 */

export type RiskAnalysis = {
  asset: string;
  side: "LONG" | "SHORT";
  entry: number;
  leverage: number;
  market: {
    markPrice: number;
    changePct24h: number;
    volume24hUsd: number;
    fundingRate: number;
    buyRatio15m: number;
    netFlow15mUsd: number;
  } | null;
  history: {
    sampleSize: number;
    winRatePct: number;
    avgPnlUsd: number;
    avgLeverage: number;
    medianLeverage: number;
  };
  volatility: {
    atrPct24h: number; // average true range as % of price
  };
  suggestedStopLoss: number | null;
  warnings: string[];
  confidence: number; // 0..100, higher = trade better aligned with our data
};

function median(nums: number[]) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

async function computeAtrPct(symbol: string): Promise<number> {
  // symbol arrives as "BTC/USDT" or "BTC-USD" or just "BTC". Normalise to UI symbol.
  const base = symbol.split(/[-/]/)[0]!.toUpperCase();
  try {
    const klines = await getKlines(`${base}/USDT`, 1); // last 1 day
    if (!klines || klines.length === 0) return 0;
    let sum = 0;
    let count = 0;
    let prevClose: number | null = null;
    for (const k of klines) {
      const tr = Math.max(
        k.high - k.low,
        prevClose !== null ? Math.abs(k.high - prevClose) : 0,
        prevClose !== null ? Math.abs(k.low - prevClose) : 0,
      );
      const pct = k.close > 0 ? tr / k.close : 0;
      sum += pct;
      count++;
      prevClose = k.close;
    }
    return count > 0 ? sum / count : 0;
  } catch {
    return 0;
  }
}

export async function analyzeIntent(opts: { asset: string; side: "LONG" | "SHORT"; entry: number; leverage: number }): Promise<RiskAnalysis> {
  const { asset, side, entry, leverage } = opts;

  // 1) Look up live market snapshot for this asset.
  let snap: MarketActivity | null = null;
  try {
    const activity = await getMarketActivity();
    const baseSymbol = asset.split(/[-/]/)[0]!.toUpperCase();
    snap = activity.find(m => m.displaySymbol === baseSymbol) ?? null;
  } catch { /* ignore */ }

  // 2) Historical hit rate — closed trades on this asset+side by tracked traders.
  // We treat any closed trade with realized PnL > 0 as a "win". Ignore the entry
  // price match on purpose: we want the population behaviour for this asset, not
  // an exact price replay (which would have a sample size of ~1).
  const lookbackDays = 30;
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  // Asset normalization — accept any of "BTC", "BTC/USDT", "BTC-USD" and try the
  // canonical UI form ("BTC/USDT") which is what the trades table stores.
  const baseSym = asset.split(/[-/]/)[0]!.toUpperCase();
  const canonicalAsset = `${baseSym}/USDT`;

  const sameSideAsset = await db.select({
    pnl: tradesTable.pnlUsd,
    leverage: tradesTable.leverage,
  })
    .from(tradesTable)
    .innerJoin(tradersTable, eq(tradesTable.traderId, tradersTable.id))
    .where(and(
      eq(tradesTable.asset, canonicalAsset),
      eq(tradesTable.side, side),
      gte(tradesTable.closedAt, since),
    ));

  const sample = sameSideAsset.length;
  const wins = sameSideAsset.filter(t => Number(t.pnl) > 0).length;
  const winRatePct = sample > 0 ? (wins / sample) * 100 : 0;
  const avgPnl = sample > 0 ? sameSideAsset.reduce((s, t) => s + Number(t.pnl), 0) / sample : 0;
  const avgLev = sample > 0 ? sameSideAsset.reduce((s, t) => s + t.leverage, 0) / sample : 0;
  const medLev = sample > 0 ? median(sameSideAsset.map(t => t.leverage)) : 0;

  // 3) Volatility from CoinGecko/Sodex klines (24h average true range %).
  const atrPct = await computeAtrPct(asset);

  // 4) Composite warnings
  const warnings: string[] = [];
  if (sample < 5) warnings.push(`Only ${sample} comparable trade(s) in last ${lookbackDays}d — sample too small to be confident`);
  if (medLev > 0 && leverage > medLev * 2) warnings.push(`Leverage ${leverage}x is more than 2× the median (${medLev.toFixed(0)}x) for this asset — liquidation risk elevated`);
  if (snap) {
    if (side === "LONG"  && snap.changePct24h < -5) warnings.push(`Asset is down ${snap.changePct24h.toFixed(1)}% in 24h — opening LONG into a downtrend`);
    if (side === "SHORT" && snap.changePct24h > 5)  warnings.push(`Asset is up ${snap.changePct24h.toFixed(1)}% in 24h — opening SHORT into an uptrend`);
    if (side === "LONG"  && snap.buyRatio15m < 0.4) warnings.push(`15m buy/sell ratio is ${(snap.buyRatio15m * 100).toFixed(0)}% — sellers in control short-term`);
    if (side === "SHORT" && snap.buyRatio15m > 0.6) warnings.push(`15m buy/sell ratio is ${(snap.buyRatio15m * 100).toFixed(0)}% — buyers in control short-term`);
    if (snap.fundingRate >  0.0005 && side === "LONG")  warnings.push(`Funding ${(snap.fundingRate * 100).toFixed(3)}% — longs are paying shorts, crowded long`);
    if (snap.fundingRate < -0.0005 && side === "SHORT") warnings.push(`Funding ${(snap.fundingRate * 100).toFixed(3)}% — shorts are paying longs, crowded short`);
  }
  if (atrPct === 0) warnings.push("No recent kline data for this asset — volatility unknown");

  // 5) Suggested stop-loss = entry ∓ 1.5 × ATR (vs side direction).
  let suggestedStopLoss: number | null = null;
  if (atrPct > 0) {
    const slDist = entry * 1.5 * atrPct;
    suggestedStopLoss = side === "LONG" ? entry - slDist : entry + slDist;
  }

  // 6) Confidence — composite 0..100. Pulls from sample-weighted historical
  // win rate, alignment with 15m flow, and a leverage-prudence factor.
  // Trend alignment is symmetrically clamped to [-5, +5] so that strong adverse
  // moves penalise as much as strong favourable moves reward (previous version
  // only upper-clamped via Math.min, biasing scores toward zero on big drops).
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  let confidence = 50;
  if (sample >= 5) confidence += (winRatePct - 50) * 0.4;
  if (snap) {
    const flowAlignment = side === "LONG" ? (snap.buyRatio15m - 0.5) : (0.5 - snap.buyRatio15m);
    confidence += flowAlignment * 30;
    const dirChange = side === "LONG" ? snap.changePct24h : -snap.changePct24h;
    const trendAlignment = clamp(dirChange, -5, 5);
    confidence += trendAlignment * 1.5;
  }
  if (medLev > 0 && leverage > medLev * 2) confidence -= 15;
  if (warnings.length > 3) confidence -= 5;
  confidence = clamp(Math.round(confidence), 0, 100);

  return {
    asset,
    side,
    entry,
    leverage,
    market: snap ? {
      markPrice: snap.markPrice,
      changePct24h: snap.changePct24h,
      volume24hUsd: snap.volume24hUsd,
      fundingRate: snap.fundingRate,
      buyRatio15m: snap.buyRatio15m,
      netFlow15mUsd: snap.netFlow15mUsd,
    } : null,
    history: {
      sampleSize: sample,
      winRatePct: Math.round(winRatePct * 10) / 10,
      avgPnlUsd: Math.round(avgPnl * 100) / 100,
      avgLeverage: Math.round(avgLev * 10) / 10,
      medianLeverage: medLev,
    },
    volatility: { atrPct24h: Math.round(atrPct * 10000) / 10000 },
    suggestedStopLoss: suggestedStopLoss !== null ? Math.round(suggestedStopLoss * 100000) / 100000 : null,
    warnings,
    confidence,
  };
}

void sql;
