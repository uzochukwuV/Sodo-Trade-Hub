import { db, tradersTable, tradesTable, indexerStateTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { subscribeWallet } from "./wallet-subs";

const SODEX_TO_UI: Record<string, string> = {
  "BTC-USD": "BTC/USDT", "ETH-USD": "ETH/USDT", "SOL-USD": "SOL/USDT",
  "BNB-USD": "BNB/USDT", "ARB-USD": "ARB/USDT", "OP-USD": "OP/USDT", "AVAX-USD": "AVAX/USDT",
  "DOGE-USD": "DOGE/USDT", "XRP-USD": "XRP/USDT", "MATIC-USD": "MATIC/USDT",
  "LINK-USD": "LINK/USDT", "ADA-USD": "ADA/USDT", "DOT-USD": "DOT/USDT",
  "TON-USD": "TON/USDT", "TRX-USD": "TRX/USDT", "LTC-USD": "LTC/USDT",
  "SUI-USD": "SUI/USDT", "INJ-USD": "INJ/USDT", "TIA-USD": "TIA/USDT",
  "SEI-USD": "SEI/USDT", "WLD-USD": "WLD/USDT", "PEPE-USD": "PEPE/USDT",
  "WIF-USD": "WIF/USDT", "BONK-USD": "BONK/USDT", "XAUT-USD": "XAUT/USDT",
};
function uiSymbol(sodex: string): string {
  return SODEX_TO_UI[sodex] ?? sodex.replace("-USD", "/USDT");
}

const BACKFILL_TRADES_PER_TRADER = 5;

const LB_BASE = "https://mainnet-data.sodex.dev/api/v1";
const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const HEADERS = { Origin: "https://sodex.com", Referer: "https://sodex.com/leaderboard" };

const MIN_WIN_RATE = 0.45;
const MIN_CLOSED_POSITIONS = 5;
const MIN_PNL_USD = 100;

const ADJECTIVES = [
  "Shadow","Alpha","Crypto","Neon","Atomic","Quantum","Velvet","Stealth","Rogue","Phantom",
  "Cipher","Vault","Onyx","Frost","Apex","Nexus","Echo","Tempest","Solar","Lunar","Ember",
  "Drift","Pulse","Vector","Helix","Forge","Halo","Storm","Aurora","Zenith",
];
const NOUNS = [
  "Whale","Hunter","Sniper","Maverick","Phoenix","Drake","Falcon","Wolf","Sentinel","Reaper",
  "Knight","Oracle","Titan","Ronin","Specter","Nomad","Voyager","Pilot","Sage","Pioneer",
  "Rider","Trader","Scout","Operator","Architect","Catalyst","Engine","Prism",
];

function nameFromAddr(addr: string): { username: string; handle: string } {
  const a = parseInt(addr.slice(2, 6), 16);
  const b = parseInt(addr.slice(6, 10), 16);
  const adj = ADJECTIVES[a % ADJECTIVES.length];
  const noun = NOUNS[b % NOUNS.length];
  const suffix = addr.slice(-4).toUpperCase();
  return {
    username: `${adj}${noun}_${suffix}`,
    handle: `${adj.toLowerCase()}${noun.toLowerCase()}_${suffix.toLowerCase()}`,
  };
}

function tierFromPnl(pnlUsd: number, winRate: number): "BRONZE" | "SILVER" | "GOLD" | "DIAMOND" {
  if (pnlUsd >= 10_000 && winRate >= 0.65) return "DIAMOND";
  if (pnlUsd >= 1_000  && winRate >= 0.55) return "GOLD";
  if (pnlUsd >= 250    && winRate >= 0.50) return "SILVER";
  return "BRONZE";
}

function repFromMetrics(pnlUsd: number, winRate: number, trades: number, volumeUsd: number): number {
  const pnlScore  = Math.min(Math.log10(Math.max(pnlUsd, 1)) * 8, 35);
  const winScore  = winRate * 30;
  const tradeScore = Math.min(Math.log10(Math.max(trades, 1)) * 10, 20);
  const volScore  = Math.min(Math.log10(Math.max(volumeUsd, 1)) * 3, 15);
  return Math.min(99.9, pnlScore + winScore + tradeScore + volScore);
}

export type LeaderboardItem = {
  window_type: string;
  wallet_address: string;
  account_id: number;
  pnl_usd: string;
  volume_usd: string;
  rank: number;
};

export type SodexPosition = {
  id: number;
  symbol: string;
  marginMode: string;
  positionSide: "LONG" | "SHORT";
  size: string;
  avgEntryPrice: string;
  avgClosePrice: string;
  cumClosedSize: string;
  realizedPnL: string;
  leverage: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export async function fetchLeaderboard(window: "24H" | "7D" | "30D" | "ALL_TIME", pageSize = 50): Promise<LeaderboardItem[]> {
  const url = `${LB_BASE}/leaderboard?window_type=${window}&sort_by=pnl&sort_order=desc&page=1&page_size=${pageSize}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  const json = await res.json() as { code: number; data?: { items?: LeaderboardItem[] }; message?: string };
  if (json.code !== 0 || !json.data?.items) throw new Error(`leaderboard fetch failed: ${json.message ?? json.code}`);
  return json.data.items;
}

export async function fetchPositions(walletAddress: string, limit = 100): Promise<SodexPosition[]> {
  const url = `${GW_BASE}/perps/accounts/${walletAddress}/positions/history?limit=${limit}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  const json = await res.json() as { code: number; data?: SodexPosition[]; message?: string };
  if (json.code !== 0) throw new Error(`positions fetch failed: ${json.message ?? json.code}`);
  return json.data ?? [];
}

export type TraderMetrics = {
  totalPnlUsd: number;
  winRate: number;
  closedCount: number;
  avgLeverage: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  symbolsTraded: number;
};

export function computeMetrics(positions: SodexPosition[]): TraderMetrics {
  const closed = positions.filter(p => !p.active && parseFloat(p.cumClosedSize || "0") > 0);
  const wins = closed.filter(p => parseFloat(p.realizedPnL) > 0).length;
  const totalPnl = closed.reduce((s, p) => s + parseFloat(p.realizedPnL), 0);
  const avgLev = closed.length > 0
    ? closed.reduce((s, p) => s + p.leverage, 0) / closed.length
    : 0;
  const timestamps = positions.map(p => p.createdAt).filter(Boolean);
  const firstSeen = timestamps.length ? new Date(Math.min(...timestamps)) : null;
  const lastSeen  = timestamps.length ? new Date(Math.max(...timestamps)) : null;
  return {
    totalPnlUsd: totalPnl,
    winRate: closed.length > 0 ? wins / closed.length : 0,
    closedCount: closed.length,
    avgLeverage: avgLev,
    firstSeen,
    lastSeen,
    symbolsTraded: new Set(positions.map(p => p.symbol)).size,
  };
}

async function getOrCreateState() {
  const existing = await db.query.indexerStateTable.findFirst();
  if (existing) return existing;
  const [created] = await db.insert(indexerStateTable).values({}).returning();
  return created;
}

export async function getIndexerStatus() {
  return getOrCreateState();
}

export type TrackerRunResult = {
  scanned: number;
  qualified: number;
  imported: number;
  skipped_low_winrate: number;
  skipped_low_volume: number;
};

/**
 * Scrape Sodex leaderboard, validate each candidate via positions/history,
 * import qualifying traders (winRate >= MIN_WIN_RATE) with REAL PnL data.
 */
export async function runTrackerOnce(opts: { window?: "24H" | "7D" | "30D" | "ALL_TIME"; pageSize?: number } = {}): Promise<TrackerRunResult> {
  const window = opts.window ?? "ALL_TIME";
  const pageSize = opts.pageSize ?? 50;

  const state = await getOrCreateState();
  if (state.isRunning) {
    logger.info({ event: "tracker.skip" }, "tracker already running, skipping");
    return { scanned: 0, qualified: 0, imported: 0, skipped_low_winrate: 0, skipped_low_volume: 0 };
  }

  await db.update(indexerStateTable)
    .set({ isRunning: true, lastError: null, updatedAt: new Date() })
    .where(eq(indexerStateTable.id, state.id));

  const result: TrackerRunResult = { scanned: 0, qualified: 0, imported: 0, skipped_low_winrate: 0, skipped_low_volume: 0 };

  try {
    logger.info({ event: "tracker.start", window, pageSize }, "leaderboard tracker starting");
    const items = await fetchLeaderboard(window, pageSize);

    for (const item of items) {
      result.scanned++;
      const wallet = item.wallet_address.toLowerCase();
      const pnlUsd = parseFloat(item.pnl_usd);
      const volumeUsd = parseFloat(item.volume_usd);

      if (pnlUsd < MIN_PNL_USD || volumeUsd < 1_000) {
        result.skipped_low_volume++;
        continue;
      }

      let positions: SodexPosition[];
      try {
        positions = await fetchPositions(wallet, 100);
      } catch (err) {
        logger.warn({ event: "tracker.positions_fail", wallet, err: String(err) }, "positions fetch failed");
        continue;
      }

      if (positions.length === 0) continue;

      const metrics = computeMetrics(positions);

      if (metrics.closedCount < MIN_CLOSED_POSITIONS) {
        result.skipped_low_volume++;
        continue;
      }
      if (metrics.winRate < MIN_WIN_RATE) {
        result.skipped_low_winrate++;
        continue;
      }

      result.qualified++;

      const tier = tierFromPnl(metrics.totalPnlUsd, metrics.winRate);
      const repScore = repFromMetrics(metrics.totalPnlUsd, metrics.winRate, metrics.closedCount, volumeUsd);
      const { username, handle } = nameFromAddr(wallet);
      const highWaterMark = positions.reduce((max, p) => Math.max(max, p.id), 0);

      const existing = await db.query.tradersTable.findFirst({ where: eq(tradersTable.walletAddress, wallet) });

      try {
        if (existing) {
          await db.update(tradersTable).set({
            totalPnlUsd: metrics.totalPnlUsd.toFixed(2),
            winRate: (metrics.winRate * 100).toFixed(2),
            tradeCount: metrics.closedCount,
            tier,
            repScore: repScore.toFixed(2),
            volumeUsd: volumeUsd.toFixed(2),
            avgLeverage: metrics.avgLeverage.toFixed(2),
            leaderboardRank: item.rank,
            leaderboardWindow: window,
            onchainTxCount: positions.length,
            onchainSuccessRate: (metrics.winRate * 100).toFixed(2),
            contractsTouched: metrics.symbolsTraded,
            firstSeenAt: metrics.firstSeen,
            lastSeenAt: metrics.lastSeen,
            lastSyncedPositionId: String(highWaterMark),
            lastSyncedAt: new Date(),
          }).where(eq(tradersTable.id, existing.id));
          result.imported++;
          logger.info({ event: "tracker.updated", wallet, username, pnl: metrics.totalPnlUsd, winRate: metrics.winRate, rank: item.rank }, "trader updated");
        } else {
          const [inserted] = await db.insert(tradersTable).values({
            username, handle,
            bio: `Top Sodex perps trader · Rank #${item.rank} (${window}) · ${metrics.closedCount} closed positions · ${metrics.symbolsTraded} symbols traded`,
            repScore: repScore.toFixed(2),
            tier,
            totalPnlUsd: metrics.totalPnlUsd.toFixed(2),
            winRate: (metrics.winRate * 100).toFixed(2),
            tradeCount: metrics.closedCount,
            volumeUsd: volumeUsd.toFixed(2),
            avgLeverage: metrics.avgLeverage.toFixed(2),
            leaderboardRank: item.rank,
            leaderboardWindow: window,
            walletAddress: wallet,
            isAutoDiscovered: true,
            onchainTxCount: positions.length,
            onchainSuccessRate: (metrics.winRate * 100).toFixed(2),
            contractsTouched: metrics.symbolsTraded,
            firstSeenAt: metrics.firstSeen,
            lastSeenAt: metrics.lastSeen,
            lastSyncedPositionId: String(highWaterMark),
            lastSyncedAt: new Date(),
          }).returning();
          result.imported++;

          // Backfill the trader's most recent closed positions as feed posts so the
          // social feed has real activity immediately (vs waiting for new trades).
          const recentClosed = positions
            .filter(p => !p.active && parseFloat(p.cumClosedSize || "0") > 0)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, BACKFILL_TRADES_PER_TRADER);
          for (const p of recentClosed) {
            const entry = parseFloat(p.avgEntryPrice);
            const exit  = parseFloat(p.avgClosePrice);
            const pnl   = parseFloat(p.realizedPnL);
            const closedSize = parseFloat(p.cumClosedSize);
            const notional = entry * closedSize;
            const pnlPct = notional > 0 ? (pnl / notional) * 100 * p.leverage : 0;
            try {
              await db.insert(tradesTable).values({
                traderId: inserted.id,
                asset: uiSymbol(p.symbol),
                side: p.positionSide,
                entryPrice: entry.toFixed(8),
                exitPrice:  exit.toFixed(8),
                pnlUsd: pnl.toFixed(2),
                pnlPct: pnlPct.toFixed(4),
                positionSize: notional.toFixed(4),
                leverage: p.leverage,
                isVerified: true,
                isOnChainVerified: true,
                sodexTradeId: String(p.id),
                comment: pnl > 0
                  ? `Closed ${p.positionSide} ${uiSymbol(p.symbol)} ${p.leverage}x for +$${pnl.toFixed(0)}`
                  : `Stopped out ${p.positionSide} ${uiSymbol(p.symbol)} ${p.leverage}x for -$${Math.abs(pnl).toFixed(0)}`,
                closedAt: new Date(p.updatedAt),
              }).onConflictDoNothing({ target: [tradesTable.traderId, tradesTable.sodexTradeId] });
            } catch (err) {
              logger.warn({ event: "tracker.backfill_fail", wallet, sodexId: p.id, err: String(err) }, "backfill insert failed");
            }
          }

          logger.info({ event: "tracker.imported", wallet, username, pnl: metrics.totalPnlUsd, winRate: metrics.winRate, rank: item.rank, backfilled: recentClosed.length }, "trader imported");
          // Hot-register WS account streams for the new wallet so subsequent
          // trades flow in within ~1 block (~1s) instead of waiting for the
          // 5-min REST safety net.
          subscribeWallet(inserted.id, wallet, username);
        }
      } catch (err) {
        logger.warn({ event: "tracker.insert_fail", wallet, err: String(err) }, "trader insert/update failed");
      }
    }

    await db.update(indexerStateTable).set({
      lastBlock: 0,
      walletsDiscovered: sql`${indexerStateTable.walletsDiscovered} + ${result.imported}`,
      lastRunAt: new Date(),
      isRunning: false,
      updatedAt: new Date(),
    }).where(eq(indexerStateTable.id, state.id));

    logger.info({ event: "tracker.done", ...result }, "tracker run complete");
    return result;
  } catch (err) {
    await db.update(indexerStateTable).set({
      isRunning: false,
      lastError: String(err),
      updatedAt: new Date(),
    }).where(eq(indexerStateTable.id, state.id));
    logger.error({ event: "tracker.fail", err }, "tracker run failed");
    throw err;
  }
}

let _trackerInterval: NodeJS.Timeout | null = null;

export function startTrackerPoller(intervalMs = 60 * 60 * 1000) {
  if (_trackerInterval) return;
  // Schedule on cadence (no boot auto-run; trigger via POST /api/indexer/run for the first sync).
  _trackerInterval = setInterval(() => {
    runTrackerOnce().catch(err => logger.error({ err }, "scheduled tracker run failed"));
  }, intervalMs);
  logger.info({ event: "tracker.poller_started", intervalMs }, "leaderboard tracker poller started (manual first sync)");
}
