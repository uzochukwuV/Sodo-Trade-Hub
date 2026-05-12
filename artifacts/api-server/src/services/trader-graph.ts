import { db, tradesTable, tradersTable } from "@workspace/db";
import { eq, sql, and, gte, ne, inArray } from "drizzle-orm";

/**
 * Trader Graph — derived from the `trades` table (which carries openedAt + sodexTradeId
 * per trader). We compute three relationships on demand and cache nothing yet (the
 * dataset is small at MVP scale; revisit with a materialized view once trades > 100k).
 *
 *  - co-entry: wallets that opened the same asset within ±15 minutes
 *  - lead/follow: who opened first vs who followed within +60 minutes
 *  - similarity: cosine over per-wallet asset/side distribution
 */

export const CO_ENTRY_WINDOW_MS = 15 * 60_000;
export const LEAD_FOLLOW_WINDOW_MS = 60 * 60_000;

type TradeRow = {
  traderId: number;
  asset: string;
  side: "LONG" | "SHORT";
  openedAt: Date | null;
  closedAt: Date;
};

async function loadRecentTrades(sinceMs: number): Promise<TradeRow[]> {
  const since = new Date(sinceMs);
  const rows = await db
    .select({
      traderId: tradesTable.traderId,
      asset: tradesTable.asset,
      side: tradesTable.side,
      openedAt: tradesTable.openedAt,
      closedAt: tradesTable.closedAt,
    })
    .from(tradesTable)
    .where(gte(tradesTable.closedAt, since));
  return rows;
}

/** Effective open time — fall back to closedAt for legacy rows missing openedAt. */
function entryTime(t: TradeRow): number {
  return (t.openedAt ?? t.closedAt).getTime();
}

/**
 * Wallets that entered the same asset within ±CO_ENTRY_WINDOW_MS of each other,
 * over the last `lookbackDays`. Returns aggregated co-entry edges with count.
 */
export async function coEntryEdges(opts: { asset?: string; lookbackDays?: number; minCount?: number } = {}) {
  const lookback = (opts.lookbackDays ?? 30) * 86400_000;
  const minCount = opts.minCount ?? 1;
  const trades = await loadRecentTrades(Date.now() - lookback);
  const filtered = opts.asset ? trades.filter(t => t.asset === opts.asset) : trades;

  // Group by asset, sort by entry time, sliding window.
  const byAsset = new Map<string, TradeRow[]>();
  for (const t of filtered) {
    const arr = byAsset.get(t.asset) ?? [];
    arr.push(t);
    byAsset.set(t.asset, arr);
  }

  const edges = new Map<string, { a: number; b: number; asset: string; count: number; lastTs: number }>();
  for (const [asset, list] of byAsset) {
    list.sort((x, y) => entryTime(x) - entryTime(y));
    for (let i = 0; i < list.length; i++) {
      const ti = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const tj = list[j]!;
        const dt = entryTime(tj) - entryTime(ti);
        if (dt > CO_ENTRY_WINDOW_MS) break;
        if (ti.traderId === tj.traderId) continue;
        if (ti.side !== tj.side) continue; // only co-direction counts as "together"
        const a = Math.min(ti.traderId, tj.traderId);
        const b = Math.max(ti.traderId, tj.traderId);
        const key = `${a}-${b}-${asset}`;
        const cur = edges.get(key) ?? { a, b, asset, count: 0, lastTs: 0 };
        cur.count++;
        cur.lastTs = Math.max(cur.lastTs, entryTime(tj));
        edges.set(key, cur);
      }
    }
  }

  return Array.from(edges.values()).filter(e => e.count >= minCount).sort((x, y) => y.count - x.count);
}

/**
 * For a given wallet, find leaders (wallets that consistently entered the same
 * asset/side BEFORE this wallet within LEAD_FOLLOW_WINDOW_MS) and followers (the inverse).
 */
export async function leadFollowFor(traderId: number, opts: { lookbackDays?: number } = {}) {
  const lookback = (opts.lookbackDays ?? 30) * 86400_000;
  const trades = await loadRecentTrades(Date.now() - lookback);

  // Group by asset for window slicing
  const byAsset = new Map<string, TradeRow[]>();
  for (const t of trades) {
    const arr = byAsset.get(t.asset) ?? [];
    arr.push(t);
    byAsset.set(t.asset, arr);
  }

  const leaders = new Map<number, { count: number; avgLagMs: number; sumLagMs: number }>();
  const followers = new Map<number, { count: number; avgLagMs: number; sumLagMs: number }>();

  // Event-based pairing — for each of MY entries on an asset+side, credit only the
  // SINGLE closest-in-time prior entry per other-trader as the leader, and the SINGLE
  // closest-in-time subsequent entry per other-trader as the follower. This avoids
  // the many-to-many inflation in the naive double loop.
  for (const [, list] of byAsset) {
    list.sort((x, y) => entryTime(x) - entryTime(y));
    const myEntries = list.filter(t => t.traderId === traderId);
    if (myEntries.length === 0) continue;

    for (const me of myEntries) {
      const myT = entryTime(me);
      // closestPrior[otherId] = { lag, ts } — the smallest positive lag (other before me)
      const closestPrior   = new Map<number, number>(); // value = lag ms
      const closestAfter   = new Map<number, number>(); // value = lag ms

      for (const other of list) {
        if (other.traderId === traderId) continue;
        if (other.side !== me.side) continue;
        const lag = myT - entryTime(other);
        if (lag > 0 && lag <= LEAD_FOLLOW_WINDOW_MS) {
          const prev = closestPrior.get(other.traderId);
          if (prev === undefined || lag < prev) closestPrior.set(other.traderId, lag);
        } else if (lag < 0 && -lag <= LEAD_FOLLOW_WINDOW_MS) {
          const prev = closestAfter.get(other.traderId);
          if (prev === undefined || -lag < prev) closestAfter.set(other.traderId, -lag);
        }
      }

      for (const [otherId, lag] of closestPrior) {
        const cur = leaders.get(otherId) ?? { count: 0, avgLagMs: 0, sumLagMs: 0 };
        cur.count++; cur.sumLagMs += lag; cur.avgLagMs = cur.sumLagMs / cur.count;
        leaders.set(otherId, cur);
      }
      for (const [otherId, lag] of closestAfter) {
        const cur = followers.get(otherId) ?? { count: 0, avgLagMs: 0, sumLagMs: 0 };
        cur.count++; cur.sumLagMs += lag; cur.avgLagMs = cur.sumLagMs / cur.count;
        followers.set(otherId, cur);
      }
    }
  }

  return {
    leaders: [...leaders.entries()].map(([id, v]) => ({ traderId: id, count: v.count, avgLagSec: Math.round(v.avgLagMs / 1000) })).sort((a, b) => b.count - a.count).slice(0, 25),
    followers: [...followers.entries()].map(([id, v]) => ({ traderId: id, count: v.count, avgLagSec: Math.round(v.avgLagMs / 1000) })).sort((a, b) => b.count - a.count).slice(0, 25),
  };
}

/**
 * Cosine similarity over (asset|side) trade-count vectors. Returns top-N most similar
 * wallets to the input traderId. Direction matters — a wallet that always longs ETH is
 * NOT similar to a wallet that always shorts ETH.
 */
export async function similarTraders(traderId: number, opts: { lookbackDays?: number; topN?: number } = {}) {
  const lookback = (opts.lookbackDays ?? 60) * 86400_000;
  const trades = await loadRecentTrades(Date.now() - lookback);

  // Build vectors: trader → Map<key, count>  where key = `${asset}:${side}`
  const vectors = new Map<number, Map<string, number>>();
  for (const t of trades) {
    const v = vectors.get(t.traderId) ?? new Map<string, number>();
    const k = `${t.asset}:${t.side}`;
    v.set(k, (v.get(k) ?? 0) + 1);
    vectors.set(t.traderId, v);
  }

  const me = vectors.get(traderId);
  if (!me) return [];

  function cosine(a: Map<string, number>, b: Map<string, number>) {
    let dot = 0, na = 0, nb = 0;
    for (const [, va] of a) na += va * va;
    for (const [, vb] of b) nb += vb * vb;
    for (const [k, va] of a) {
      const vb = b.get(k);
      if (vb !== undefined) dot += va * vb;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  const scores: { traderId: number; similarity: number; sharedAssets: number }[] = [];
  for (const [otherId, vec] of vectors) {
    if (otherId === traderId) continue;
    const sim = cosine(me, vec);
    if (sim <= 0) continue;
    let shared = 0;
    for (const k of me.keys()) if (vec.has(k)) shared++;
    scores.push({ traderId: otherId, similarity: Math.round(sim * 1000) / 1000, sharedAssets: shared });
  }
  return scores.sort((a, b) => b.similarity - a.similarity).slice(0, opts.topN ?? 20);
}

/**
 * "Narrative leaders" for a given asset — wallets whose entries on that asset
 * consistently happen before the crowd, weighted by win rate. Used by the feed to
 * surface "X traders just entered $ASSET — and they were early last 3 times".
 */
export async function narrativeLeaders(asset: string, opts: { lookbackDays?: number } = {}) {
  const lookback = (opts.lookbackDays ?? 30) * 86400_000;
  const trades = (await loadRecentTrades(Date.now() - lookback)).filter(t => t.asset === asset);
  if (trades.length < 4) return [];

  trades.sort((a, b) => entryTime(a) - entryTime(b));
  const ranks = new Map<number, { earliestRanks: number[]; total: number }>();
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]!;
    const cur = ranks.get(t.traderId) ?? { earliestRanks: [], total: 0 };
    cur.earliestRanks.push(i);
    cur.total++;
    ranks.set(t.traderId, cur);
  }

  const out: { traderId: number; avgRank: number; trades: number }[] = [];
  for (const [id, v] of ranks) {
    const avg = v.earliestRanks.reduce((s, x) => s + x, 0) / v.earliestRanks.length;
    out.push({ traderId: id, avgRank: Math.round(avg * 100) / 100, trades: v.total });
  }
  return out.sort((a, b) => a.avgRank - b.avgRank).slice(0, 10);
}

/** Hydrate raw traderIds with username/tier/repScore for client display. */
export async function hydrateTraders(ids: number[]) {
  if (ids.length === 0) return new Map<number, { id: number; username: string; tier: string; repScore: number; walletAddress: string | null }>();
  const rows = await db.select({
    id: tradersTable.id,
    username: tradersTable.username,
    tier: tradersTable.tier,
    repScore: tradersTable.repScore,
    walletAddress: tradersTable.walletAddress,
  }).from(tradersTable).where(inArray(tradersTable.id, ids));
  const map = new Map<number, { id: number; username: string; tier: string; repScore: number; walletAddress: string | null }>();
  for (const r of rows) map.set(r.id, { ...r, repScore: Number(r.repScore) });
  return map;
}

// keep ts happy on unused
void sql; void eq; void and; void ne;
