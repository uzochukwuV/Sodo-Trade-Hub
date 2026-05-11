import { db, tradersTable, indexerStateTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const VC_API = "https://main-scan.valuechain.xyz/api/v1";
const SODEX_BOT = "0x7ce7a713a4b176fc08790e128a2019453251f80a";
const SODEX_CONTRACTS = [
  "0x441bdb33c7d6dc49f627a42c3d71671d50dc2e94",
  "0x478fec6b6ead70d0e03beeba15027aa6d51180ab",
  "0xb37295d1ea21e65b76dcb2e85e035ee0dbfc70cb",
  "0x5ff862b9c4cd81afbed068062c156e6c7289e4a5",
];

const ADJECTIVES = [
  "Shadow", "Alpha", "Crypto", "Neon", "Atomic", "Quantum", "Velvet",
  "Stealth", "Rogue", "Phantom", "Cipher", "Vault", "Onyx", "Frost",
  "Apex", "Nexus", "Echo", "Tempest", "Solar", "Lunar", "Ember", "Drift",
  "Pulse", "Vector", "Helix", "Forge", "Halo", "Storm", "Aurora", "Zenith",
];
const NOUNS = [
  "Whale", "Hunter", "Sniper", "Maverick", "Phoenix", "Drake", "Falcon",
  "Wolf", "Sentinel", "Reaper", "Knight", "Oracle", "Titan", "Ronin",
  "Specter", "Nomad", "Voyager", "Pilot", "Sage", "Pioneer", "Rider",
  "Trader", "Scout", "Operator", "Architect", "Catalyst", "Engine", "Prism",
];

type Tx = {
  blockNumber: string;
  from: string;
  to: string;
  hash: string;
  timeStamp: string;
  isError: string;
};

async function vcFetch(params: Record<string, string>) {
  const url = new URL(VC_API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  return r.json() as Promise<{ status?: string; message?: string; result: unknown }>;
}

function handleFromAddr(addr: string): { username: string; handle: string } {
  const seed1 = parseInt(addr.slice(2, 6), 16);
  const seed2 = parseInt(addr.slice(6, 10), 16);
  const adj = ADJECTIVES[seed1 % ADJECTIVES.length];
  const noun = NOUNS[seed2 % NOUNS.length];
  const suffix = addr.slice(-4).toUpperCase();
  return {
    username: `${adj}${noun}_${suffix}`,
    handle: `${adj.toLowerCase()}${noun.toLowerCase()}_${suffix.toLowerCase()}`,
  };
}

function tierFromMetrics(txCount: number, successRate: number): "BRONZE" | "SILVER" | "GOLD" | "DIAMOND" {
  if (txCount >= 100 && successRate >= 0.95) return "DIAMOND";
  if (txCount >= 50 && successRate >= 0.9) return "GOLD";
  if (txCount >= 20) return "SILVER";
  return "BRONZE";
}

function repFromMetrics(txCount: number, successRate: number, contracts: number, daysActive: number): number {
  const activity = Math.min(Math.log10(Math.max(txCount, 1)) * 12, 30);
  const success = successRate * 30;
  const longevity = Math.min(daysActive / 365, 1) * 20;
  const diversity = Math.min(contracts, 4) * 5;
  return Math.min(99.9, activity + success + longevity + diversity);
}

async function getOrCreateState() {
  const existing = await db.query.indexerStateTable.findFirst();
  if (existing) return existing;
  const [created] = await db.insert(indexerStateTable).values({}).returning();
  return created;
}

async function fetchContractTxs(contract: string, startBlock: number): Promise<Tx[]> {
  const data = await vcFetch({
    module: "account", action: "txlist", address: contract,
    startblock: String(startBlock), endblock: "99999999",
    sort: "desc", limit: "100",
  });
  return Array.isArray(data.result) ? (data.result as Tx[]) : [];
}

async function analyzeWallet(address: string) {
  const data = await vcFetch({
    module: "account", action: "txlist", address,
    startblock: "0", endblock: "99999999", sort: "desc", limit: "100",
  });
  if (!Array.isArray(data.result) || !data.result.length) return null;
  const txs = data.result as Tx[];
  const successful = txs.filter(t => t.isError !== "1").length;
  const successRate = successful / txs.length;
  const sodexTxs = txs.filter(t => SODEX_CONTRACTS.includes(t.to?.toLowerCase()));
  const contractsTouched = new Set(sodexTxs.map(t => t.to?.toLowerCase())).size;
  const timestamps = txs.map(t => Number(t.timeStamp) * 1000).filter(Boolean);
  const firstSeen = timestamps.length ? new Date(Math.min(...timestamps)) : null;
  const lastSeen = timestamps.length ? new Date(Math.max(...timestamps)) : null;
  const daysActive = firstSeen && lastSeen ? (lastSeen.getTime() - firstSeen.getTime()) / 86_400_000 : 0;
  return {
    txCount: txs.length,
    sodexTxCount: sodexTxs.length,
    successRate,
    contractsTouched,
    firstSeen,
    lastSeen,
    daysActive,
  };
}

export async function runIndexerOnce(): Promise<{ scanned: number; discovered: number; highBlock: number }> {
  const state = await getOrCreateState();
  if (state.isRunning) {
    logger.info({ event: "indexer.skip" }, "indexer already running, skipping");
    return { scanned: 0, discovered: 0, highBlock: state.lastBlock };
  }

  await db.update(indexerStateTable)
    .set({ isRunning: true, lastError: null, updatedAt: new Date() })
    .where(eq(indexerStateTable.id, state.id));

  let scanned = 0;
  let discovered = 0;
  let highBlock = state.lastBlock;

  try {
    const startBlock = state.lastBlock || 0;
    logger.info({ event: "indexer.start", startBlock }, "indexer scan starting");

    const candidateAddrs = new Set<string>();

    for (const contract of SODEX_CONTRACTS) {
      const txs = await fetchContractTxs(contract, startBlock);
      for (const t of txs) {
        const from = t.from?.toLowerCase();
        if (!from || from === SODEX_BOT) continue;
        if (!/^0x[0-9a-f]{40}$/.test(from)) continue;
        const blk = Number(t.blockNumber);
        if (blk > highBlock) highBlock = blk;
        candidateAddrs.add(from);
      }
    }

    for (const addr of [...candidateAddrs].slice(0, 25)) {
      scanned++;
      const existing = await db.query.tradersTable.findFirst({
        where: eq(tradersTable.walletAddress, addr),
      });
      if (existing) continue;

      const metrics = await analyzeWallet(addr);
      if (!metrics || metrics.sodexTxCount < 1) continue;

      const { username, handle } = handleFromAddr(addr);
      const tier = tierFromMetrics(metrics.sodexTxCount, metrics.successRate);
      const repScore = repFromMetrics(metrics.sodexTxCount, metrics.successRate, metrics.contractsTouched, metrics.daysActive);

      try {
        await db.insert(tradersTable).values({
          username,
          handle,
          bio: `Auto-discovered from Sodex on-chain activity. ${metrics.sodexTxCount} perp interactions across ${metrics.contractsTouched} contracts.`,
          repScore: repScore.toFixed(2),
          tier,
          totalPnlUsd: "0",
          winRate: "0",
          tradeCount: 0,
          followerCount: 0,
          walletAddress: addr,
          isAutoDiscovered: true,
          onchainTxCount: metrics.txCount,
          onchainSuccessRate: (metrics.successRate * 100).toFixed(2),
          contractsTouched: metrics.contractsTouched,
          firstSeenAt: metrics.firstSeen,
          lastSeenAt: metrics.lastSeen,
        });
        discovered++;
        logger.info({ event: "indexer.discovered", addr, username, tier, repScore }, "new trader discovered");
      } catch (e) {
        logger.warn({ event: "indexer.insert_failed", addr, error: String(e) }, "trader insert failed");
      }
    }

    await db.update(indexerStateTable).set({
      lastBlock: highBlock,
      walletsDiscovered: sql`${indexerStateTable.walletsDiscovered} + ${discovered}`,
      lastRunAt: new Date(),
      isRunning: false,
      updatedAt: new Date(),
    }).where(eq(indexerStateTable.id, state.id));

    logger.info({ event: "indexer.done", scanned, discovered, highBlock }, "indexer scan complete");
    return { scanned, discovered, highBlock };
  } catch (e) {
    await db.update(indexerStateTable).set({
      isRunning: false,
      lastError: String(e),
      updatedAt: new Date(),
    }).where(eq(indexerStateTable.id, state.id));
    logger.error({ event: "indexer.error", error: String(e) }, "indexer failed");
    throw e;
  }
}

export async function getIndexerStatus() {
  return getOrCreateState();
}

let pollerTimer: NodeJS.Timeout | null = null;

export function startIndexerPoller(intervalMs = 60_000) {
  if (pollerTimer) return;
  logger.info({ event: "indexer.poller_start", intervalMs }, "indexer poller starting");
  setTimeout(() => { runIndexerOnce().catch(() => {}); }, 5_000);
  pollerTimer = setInterval(() => {
    runIndexerOnce().catch(() => {});
  }, intervalMs);
}
