import { db, valuechainBlockAnalysesTable, valuechainInvestigationsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DEFAULT_RPC_URL = process.env["VALUECHAIN_RPC_URL"] ?? "https://testnet-v2.valuechain.xyz";
const DEFAULT_SODEX_PERPS_URL = process.env["SODEX_PERPS_URL"] ?? "https://testnet-gw.sodex.dev/api/v1/perps";
const CHAIN_ID = Number(process.env["VALUECHAIN_CHAIN_ID"] ?? 138565);
const MAX_BLOCK_COUNT = 20;
const SODEX_TIME_PAD_MS = 5 * 60_000;
const CLUSTER_WINDOW_MS = 10 * 60_000;

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

type RpcTx = {
  hash: string;
  from: string;
  to: string | null;
  input?: string;
  value?: string;
};

type RpcLog = {
  address: string;
  topics?: string[];
  data?: string;
};

type RpcReceipt = {
  transactionHash: string;
  logs?: RpcLog[];
};

type RpcBlock = {
  number: string;
  hash: string;
  timestamp: string;
  transactions: RpcTx[];
};

type AccountTrade = {
  symbol?: string;
  tradeID?: number;
  orderID?: number;
  side?: string;
  price?: string;
  quantity?: string;
  time?: number;
  isMaker?: boolean;
};

type AccountPosition = {
  id?: number;
  symbol?: string;
  positionSide?: string;
  avgEntryPrice?: string;
  avgClosePrice?: string;
  realizedPnL?: string;
  leverage?: number;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type AccountOrder = {
  symbol?: string;
  orderID?: number;
  side?: string;
  type?: string;
  status?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  createdAt?: number;
  updatedAt?: number;
  reduceOnly?: boolean;
};

type AccountFunding = {
  symbol?: string;
  positionID?: number;
  fundingFee?: string;
  timestamp?: number;
};

type WalletActivity = {
  address: string;
  trades: AccountTrade[];
  positions: AccountPosition[];
  orders: AccountOrder[];
  fundings: AccountFunding[];
};

type CandidateMeta = {
  address: string;
  sources: Set<string>;
  txHashes: Set<string>;
  hasNativeValue: boolean;
};

export type BlockFacts = {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  txCount: number;
  candidateAddresses: string[];
  candidateSources: Array<{ address: string; sources: string[]; txHashes: string[]; hasNativeValue: boolean }>;
  sodexWallets: WalletActivity[];
  clusters: AnalysisCluster[];
};

export type AnalysisCluster = {
  type: "deposit_to_position" | "synchronized_entry";
  severity: "low" | "medium" | "high";
  title: string;
  walletAddresses: string[];
  symbol?: string;
  side?: string;
  blockNumbers: number[];
  evidence: Record<string, unknown>;
};

export type RangeAnalysisResult = {
  input: {
    startBlock: number;
    blockCount: number;
    endBlock: number;
  };
  summary: {
    blocksRequested: number;
    cacheHits: number;
    newlyAnalyzed: number;
    txCount: number;
    candidateAddressCount: number;
    sodexWalletCount: number;
    tradeCount: number;
    positionCount: number;
    clusterCount: number;
    depositToPositionClusters: number;
    synchronizedEntryClusters: number;
    topWallets: Array<{ address: string; trades: number; positions: number; orders: number; fundings: number }>;
  };
  blocks: Array<BlockFacts & { cacheHit: boolean }>;
  rangeClusters: AnalysisCluster[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asAddress(value: unknown): string | null {
  const text = asString(value)?.toLowerCase();
  if (!text || !/^0x[0-9a-f]{40}$/.test(text)) return null;
  if (text === "0x0000000000000000000000000000000000000000") return null;
  return text;
}

function hexToNumber(value: string | undefined): number {
  if (!value) return 0;
  return Number.parseInt(value, 16);
}

function hexToBigInt(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function addressesFromHexWords(hexData: unknown): string[] {
  const data = asString(hexData)?.toLowerCase();
  if (!data?.startsWith("0x") || data.length < 66) return [];
  const body = data.slice(2);
  const out = new Set<string>();
  for (let i = 0; i <= body.length - 64; i += 64) {
    const word = body.slice(i, i + 64);
    const address = asAddress(`0x${word.slice(-40)}`);
    if (address) out.add(address);
  }
  return [...out];
}

function compactActivity(activity: WalletActivity): WalletActivity {
  return {
    address: activity.address,
    trades: activity.trades.slice(0, 50),
    positions: activity.positions.slice(0, 50),
    orders: activity.orders.slice(0, 50),
    fundings: activity.fundings.slice(0, 50),
  };
}

class RpcClient {
  private id = 1;

  constructor(private readonly url: string) {}

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const id = this.id++;
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "curl/8.5.0",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
    const json = await response.json() as JsonRpcResponse<T>;
    if (json.error) throw new Error(`RPC ${method} failed: ${json.error.message}`);
    return json.result as T;
  }

  async batch<T>(calls: Array<{ method: string; params: unknown[] }>): Promise<Array<T | null>> {
    const payload = calls.map((call) => ({
      jsonrpc: "2.0",
      id: this.id++,
      method: call.method,
      params: call.params,
    }));
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "curl/8.5.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`RPC batch failed with HTTP ${response.status}`);
    const json = await response.json() as Array<JsonRpcResponse<T>>;
    const byId = new Map(json.map((item) => [item.id, item]));
    return payload.map((item) => {
      const match = byId.get(item.id);
      if (!match || match.error) return null;
      return match.result ?? null;
    });
  }
}

function blockHex(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}

function extractCandidateMap(blocks: RpcBlock[], receiptsByBlock: Map<number, RpcReceipt[]>): Map<string, CandidateMeta> {
  const candidates = new Map<string, CandidateMeta>();

  function touch(address: string, source: string, txHash?: string, hasNativeValue = false) {
    const current = candidates.get(address) ?? {
      address,
      sources: new Set<string>(),
      txHashes: new Set<string>(),
      hasNativeValue: false,
    };
    current.sources.add(source);
    if (txHash) current.txHashes.add(txHash);
    current.hasNativeValue = current.hasNativeValue || hasNativeValue;
    candidates.set(address, current);
  }

  for (const block of blocks) {
    const blockNumber = hexToNumber(block.number);
    for (const tx of block.transactions ?? []) {
      const from = asAddress(tx.from);
      const to = asAddress(tx.to);
      const hasNativeValue = hexToBigInt(tx.value) > 0n;
      if (from) touch(from, "tx.from", tx.hash, hasNativeValue);
      if (to) touch(to, "tx.to", tx.hash);
      for (const address of addressesFromHexWords(tx.input)) {
        touch(address, "calldata", tx.hash);
      }
    }

    for (const receipt of receiptsByBlock.get(blockNumber) ?? []) {
      for (const log of receipt.logs ?? []) {
        const logAddress = asAddress(log.address);
        if (logAddress) touch(logAddress, "log.address", receipt.transactionHash);
        for (const topic of log.topics ?? []) {
          for (const address of addressesFromHexWords(topic)) touch(address, "log.topic", receipt.transactionHash);
        }
        for (const address of addressesFromHexWords(log.data)) touch(address, "log.data", receipt.transactionHash);
      }
    }
  }

  return candidates;
}

async function fetchReceipts(rpc: RpcClient, blocks: RpcBlock[]): Promise<Map<number, RpcReceipt[]>> {
  const byBlock = new Map<number, RpcReceipt[]>();
  const receiptLists = await rpc.batch<RpcReceipt[]>(blocks.map((block) => ({
    method: "eth_getBlockReceipts",
    params: [block.number],
  })));

  const fallbackCalls: Array<{ blockNumber: number; txHash: string }> = [];
  blocks.forEach((block, index) => {
    const blockNumber = hexToNumber(block.number);
    const receipts = receiptLists[index];
    if (Array.isArray(receipts)) {
      byBlock.set(blockNumber, receipts);
      return;
    }
    for (const tx of block.transactions ?? []) {
      fallbackCalls.push({ blockNumber, txHash: tx.hash });
    }
  });

  if (fallbackCalls.length > 0) {
    const fetched = await rpc.batch<RpcReceipt>(fallbackCalls.map((item) => ({
      method: "eth_getTransactionReceipt",
      params: [item.txHash],
    })));
    fetched.forEach((receipt, index) => {
      if (!receipt) return;
      const blockNumber = fallbackCalls[index]?.blockNumber;
      if (!blockNumber) return;
      byBlock.set(blockNumber, [...(byBlock.get(blockNumber) ?? []), receipt]);
    });
  }

  return byBlock;
}

async function sodexGet<T>(baseUrl: string, address: string, path: string, startTime: number, endTime: number, limit: number): Promise<T[]> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/accounts/${address}/${path}`);
  url.searchParams.set("startTime", String(startTime));
  url.searchParams.set("endTime", String(endTime));
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "curl/8.5.0",
      Origin: "https://sodex.com",
      Referer: "https://sodex.com",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  const json = await response.json() as { code?: number; data?: unknown };
  return json.code === 0 && Array.isArray(json.data) ? json.data as T[] : [];
}

async function fetchWalletActivity(addresses: string[], startTime: number, endTime: number): Promise<Map<string, WalletActivity>> {
  const out = new Map<string, WalletActivity>();
  await Promise.all(addresses.map(async (address) => {
    const [trades, positions, orders, fundings] = await Promise.all([
      sodexGet<AccountTrade>(DEFAULT_SODEX_PERPS_URL, address, "trades", startTime, endTime, 1000),
      sodexGet<AccountPosition>(DEFAULT_SODEX_PERPS_URL, address, "positions/history", startTime, endTime, 500),
      sodexGet<AccountOrder>(DEFAULT_SODEX_PERPS_URL, address, "orders/history", startTime, endTime, 500),
      sodexGet<AccountFunding>(DEFAULT_SODEX_PERPS_URL, address, "fundings", startTime, endTime, 1000),
    ]);
    if (trades.length + positions.length + orders.length + fundings.length === 0) return;
    out.set(address, { address, trades, positions, orders, fundings });
  }));
  return out;
}

function activityTimes(activity: WalletActivity): number[] {
  return [
    ...activity.trades.map((item) => item.time),
    ...activity.positions.flatMap((item) => [item.createdAt, item.updatedAt]),
    ...activity.orders.flatMap((item) => [item.createdAt, item.updatedAt]),
    ...activity.fundings.map((item) => item.timestamp),
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function activityInWindow(activity: WalletActivity, startMs: number, endMs: number): WalletActivity {
  const inWindow = (value: number | undefined) => typeof value === "number" && value >= startMs && value <= endMs;
  return {
    address: activity.address,
    trades: activity.trades.filter((item) => inWindow(item.time)),
    positions: activity.positions.filter((item) => inWindow(item.createdAt) || inWindow(item.updatedAt)),
    orders: activity.orders.filter((item) => inWindow(item.createdAt) || inWindow(item.updatedAt)),
    fundings: activity.fundings.filter((item) => inWindow(item.timestamp)),
  };
}

function detectDepositToPosition(block: RpcBlock, blockActivity: WalletActivity[], candidateMap: Map<string, CandidateMeta>): AnalysisCluster[] {
  const blockNumber = hexToNumber(block.number);
  const blockTime = hexToNumber(block.timestamp) * 1000;
  const clusters: AnalysisCluster[] = [];
  for (const activity of blockActivity) {
    const meta = candidateMap.get(activity.address);
    const hasCalldata = meta?.sources.has("calldata") ?? false;
    const hasNativeValue = meta?.hasNativeValue ?? false;
    const nearPosition = activity.positions.find((position) => {
      const t = position.createdAt ?? position.updatedAt;
      return typeof t === "number" && Math.abs(t - blockTime) <= SODEX_TIME_PAD_MS;
    });
    if (!nearPosition || (!hasCalldata && !hasNativeValue)) continue;
    clusters.push({
      type: "deposit_to_position",
      severity: hasCalldata && hasNativeValue ? "high" : "medium",
      title: `${activity.address.slice(0, 8)} funded/encoded before ${nearPosition.symbol ?? "SoDEX"} position`,
      walletAddresses: [activity.address],
      symbol: nearPosition.symbol,
      side: nearPosition.positionSide,
      blockNumbers: [blockNumber],
      evidence: {
        sources: [...(meta?.sources ?? [])],
        txHashes: [...(meta?.txHashes ?? [])].slice(0, 5),
        position: nearPosition,
      },
    });
  }
  return clusters;
}

function detectSynchronizedEntries(blocks: RpcBlock[], walletActivities: Map<string, WalletActivity>): AnalysisCluster[] {
  const entries: Array<{ address: string; symbol: string; side: string; time: number; blockNumber: number; trade: AccountTrade }> = [];
  const sortedBlocks = [...blocks].sort((a, b) => hexToNumber(a.number) - hexToNumber(b.number));

  function nearestBlockNumber(time: number): number {
    let best = hexToNumber(sortedBlocks[0]?.number ?? "0x0");
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const block of sortedBlocks) {
      const distance = Math.abs((hexToNumber(block.timestamp) * 1000) - time);
      if (distance < bestDistance) {
        best = hexToNumber(block.number);
        bestDistance = distance;
      }
    }
    return best;
  }

  for (const activity of walletActivities.values()) {
    for (const trade of activity.trades) {
      if (!trade.symbol || !trade.side || typeof trade.time !== "number") continue;
      entries.push({
        address: activity.address,
        symbol: trade.symbol,
        side: trade.side,
        time: trade.time,
        blockNumber: nearestBlockNumber(trade.time),
        trade,
      });
    }
  }

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.symbol}:${entry.side}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const clusters: AnalysisCluster[] = [];
  for (const [key, group] of groups) {
    const sorted = group.sort((a, b) => a.time - b.time);
    for (let i = 0; i < sorted.length; i++) {
      const root = sorted[i];
      if (!root) continue;
      const window = sorted.filter((item) => item.time >= root.time && item.time <= root.time + CLUSTER_WINDOW_MS);
      const wallets = [...new Set(window.map((item) => item.address))];
      if (wallets.length < 2) continue;
      const [symbol, side] = key.split(":");
      clusters.push({
        type: "synchronized_entry",
        severity: wallets.length >= 3 ? "high" : "medium",
        title: `${wallets.length} wallets entered ${side} ${symbol} within 10m`,
        walletAddresses: wallets,
        symbol,
        side,
        blockNumbers: [...new Set(window.map((item) => item.blockNumber))],
        evidence: {
          trades: window.slice(0, 10).map((item) => ({
            address: item.address,
            time: item.time,
            price: item.trade.price,
            quantity: item.trade.quantity,
            tradeID: item.trade.tradeID,
          })),
        },
      });
      break;
    }
  }

  return clusters;
}

function summarize(input: { startBlock: number; blockCount: number; endBlock: number }, blocks: Array<BlockFacts & { cacheHit: boolean }>, rangeClusters: AnalysisCluster[]): RangeAnalysisResult["summary"] {
  const walletCounts = new Map<string, { address: string; trades: number; positions: number; orders: number; fundings: number }>();
  for (const block of blocks) {
    for (const activity of block.sodexWallets) {
      const current = walletCounts.get(activity.address) ?? { address: activity.address, trades: 0, positions: 0, orders: 0, fundings: 0 };
      current.trades += activity.trades.length;
      current.positions += activity.positions.length;
      current.orders += activity.orders.length;
      current.fundings += activity.fundings.length;
      walletCounts.set(activity.address, current);
    }
  }
  return {
    blocksRequested: input.blockCount,
    cacheHits: blocks.filter((block) => block.cacheHit).length,
    newlyAnalyzed: blocks.filter((block) => !block.cacheHit).length,
    txCount: blocks.reduce((sum, block) => sum + block.txCount, 0),
    candidateAddressCount: new Set(blocks.flatMap((block) => block.candidateAddresses)).size,
    sodexWalletCount: walletCounts.size,
    tradeCount: [...walletCounts.values()].reduce((sum, item) => sum + item.trades, 0),
    positionCount: [...walletCounts.values()].reduce((sum, item) => sum + item.positions, 0),
    clusterCount: rangeClusters.length,
    depositToPositionClusters: rangeClusters.filter((cluster) => cluster.type === "deposit_to_position").length,
    synchronizedEntryClusters: rangeClusters.filter((cluster) => cluster.type === "synchronized_entry").length,
    topWallets: [...walletCounts.values()]
      .sort((a, b) => (b.trades + b.positions + b.orders + b.fundings) - (a.trades + a.positions + a.orders + a.fundings))
      .slice(0, 10),
  };
}

function parseCachedFacts(value: unknown): BlockFacts | null {
  if (!isRecord(value)) return null;
  if (typeof value["blockNumber"] !== "number") return null;
  if (typeof value["blockHash"] !== "string") return null;
  return value as BlockFacts;
}

export async function analyzeValuechainRange(opts: { startBlock: number; blockCount: number }): Promise<RangeAnalysisResult> {
  const startBlock = Math.max(0, Math.trunc(opts.startBlock));
  const blockCount = Math.min(Math.max(1, Math.trunc(opts.blockCount)), MAX_BLOCK_COUNT);
  const endBlock = startBlock + blockCount - 1;
  const blockNumbers = Array.from({ length: blockCount }, (_, index) => startBlock + index);

  const cachedRows = await db.select().from(valuechainBlockAnalysesTable)
    .where(inArray(valuechainBlockAnalysesTable.blockNumber, blockNumbers));
  const cached = new Map<number, BlockFacts>();
  for (const row of cachedRows) {
    const facts = parseCachedFacts(row.facts);
    if (facts) cached.set(row.blockNumber, facts);
  }

  const missing = blockNumbers.filter((number) => !cached.has(number));
  const analyzed = new Map<number, BlockFacts>();

  if (missing.length > 0) {
    const rpc = new RpcClient(DEFAULT_RPC_URL);
    const fetchedBlocks = await rpc.batch<RpcBlock>(missing.map((number) => ({
      method: "eth_getBlockByNumber",
      params: [blockHex(number), true],
    })));
    const blocks = fetchedBlocks.filter((block): block is RpcBlock => Boolean(block?.number && block.hash));
    if (blocks.length === 0) {
      const cachedBlocks = blockNumbers.flatMap((number) => {
        const facts = cached.get(number);
        return facts ? [{ ...facts, cacheHit: true }] : [];
      });
      const rangeClusters = dedupeClusters(cachedBlocks.flatMap((block) => block.clusters));
      return {
        input: { startBlock, blockCount, endBlock },
        summary: summarize({ startBlock, blockCount, endBlock }, cachedBlocks, rangeClusters),
        blocks: cachedBlocks,
        rangeClusters,
      };
    }
    const receiptsByBlock = await fetchReceipts(rpc, blocks);
    const candidateMap = extractCandidateMap(blocks, receiptsByBlock);
    const minTimestamp = Math.min(...blocks.map((block) => hexToNumber(block.timestamp) * 1000));
    const maxTimestamp = Math.max(...blocks.map((block) => hexToNumber(block.timestamp) * 1000));
    const walletActivities = await fetchWalletActivity(
      [...candidateMap.keys()],
      Math.max(0, minTimestamp - SODEX_TIME_PAD_MS),
      maxTimestamp + SODEX_TIME_PAD_MS,
    );
    const synchronizedClusters = detectSynchronizedEntries(blocks, walletActivities);

    for (const block of blocks) {
      const blockNumber = hexToNumber(block.number);
      const blockCandidateMap = extractCandidateMap([block], receiptsByBlock);
      const blockTime = hexToNumber(block.timestamp) * 1000;
      const blockStart = blockTime - SODEX_TIME_PAD_MS;
      const blockEnd = blockTime + SODEX_TIME_PAD_MS;
      const blockActivities = [...walletActivities.values()]
        .map((activity) => activityInWindow(activity, blockStart, blockEnd))
        .filter((activity) => activity.trades.length + activity.positions.length + activity.orders.length + activity.fundings.length > 0)
        .map(compactActivity);
      const blockCandidateSources = [...blockCandidateMap.values()].map((meta) => ({
        address: meta.address,
        sources: [...meta.sources].sort(),
        txHashes: [...meta.txHashes].slice(0, 10),
        hasNativeValue: meta.hasNativeValue,
      }));
      const depositClusters = detectDepositToPosition(block, blockActivities, blockCandidateMap);
      const blockSyncClusters = synchronizedClusters.filter((cluster) => cluster.blockNumbers.includes(blockNumber));
      const facts: BlockFacts = {
        blockNumber,
        blockHash: block.hash,
        timestamp: blockTime,
        txCount: block.transactions?.length ?? 0,
        candidateAddresses: [...blockCandidateMap.keys()].sort(),
        candidateSources: blockCandidateSources,
        sodexWallets: blockActivities,
        clusters: [...depositClusters, ...blockSyncClusters],
      };
      analyzed.set(blockNumber, facts);
      await db.insert(valuechainBlockAnalysesTable).values({
        blockNumber,
        blockHash: block.hash,
        chainId: CHAIN_ID,
        txCount: facts.txCount,
        candidateCount: facts.candidateAddresses.length,
        sodexWalletCount: facts.sodexWallets.length,
        clusterCount: facts.clusters.length,
        facts,
      }).onConflictDoUpdate({
        target: valuechainBlockAnalysesTable.blockNumber,
        set: {
          blockHash: block.hash,
          txCount: facts.txCount,
          candidateCount: facts.candidateAddresses.length,
          sodexWalletCount: facts.sodexWallets.length,
          clusterCount: facts.clusters.length,
          analyzedAt: new Date(),
          facts,
        },
      });
    }
  }

  const blocks = blockNumbers.flatMap((number) => {
    const facts = cached.get(number);
    if (facts) return [{ ...facts, cacheHit: true }];
    const fresh = analyzed.get(number);
    if (fresh) return [{ ...fresh, cacheHit: false }];
    return [];
  });
  const rangeClusters = dedupeClusters(blocks.flatMap((block) => block.clusters));
  return {
    input: { startBlock, blockCount, endBlock },
    summary: summarize({ startBlock, blockCount, endBlock }, blocks, rangeClusters),
    blocks,
    rangeClusters,
  };
}

function dedupeClusters(clusters: AnalysisCluster[]): AnalysisCluster[] {
  const seen = new Set<string>();
  const out: AnalysisCluster[] = [];
  for (const cluster of clusters) {
    const key = [
      cluster.type,
      cluster.symbol ?? "",
      cluster.side ?? "",
      cluster.walletAddresses.slice().sort().join(","),
      cluster.blockNumbers.slice().sort((a, b) => a - b).join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cluster);
  }
  return out;
}

export async function saveValuechainInvestigation(opts: {
  title: string;
  userId?: number | null;
  result: RangeAnalysisResult;
}) {
  const [row] = await db.insert(valuechainInvestigationsTable).values({
    userId: opts.userId ?? null,
    title: opts.title.slice(0, 120),
    startBlock: opts.result.input.startBlock,
    blockCount: opts.result.input.blockCount,
    endBlock: opts.result.input.endBlock,
    summary: opts.result.summary,
    blockNumbers: opts.result.blocks.map((block) => block.blockNumber),
  }).returning();
  return row;
}

export async function listValuechainInvestigations(limit: number) {
  return db.query.valuechainInvestigationsTable.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    limit,
  });
}

export async function getValuechainInvestigation(id: number) {
  const [row] = await db.select().from(valuechainInvestigationsTable)
    .where(eq(valuechainInvestigationsTable.id, id))
    .limit(1);
  if (!row) return null;
  const blockNumbers = Array.isArray(row.blockNumbers) ? row.blockNumbers.filter((value): value is number => typeof value === "number") : [];
  if (blockNumbers.length === 0) {
    return { investigation: row, blocks: [] };
  }
  const blocks = await db.select().from(valuechainBlockAnalysesTable)
    .where(inArray(valuechainBlockAnalysesTable.blockNumber, blockNumbers));
  return {
    investigation: row,
    blocks: blocks
      .map((block) => parseCachedFacts(block.facts))
      .filter((block): block is BlockFacts => Boolean(block))
      .sort((a, b) => a.blockNumber - b.blockNumber),
  };
}
