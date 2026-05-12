import { Router, type IRouter } from "express";
import { coEntryEdges, leadFollowFor, similarTraders, narrativeLeaders, hydrateTraders } from "../services/trader-graph";
import { db, tradersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/** GET /api/graph/co-enter?asset=BTC/USDT&days=30 — wallet pairs that entered together. */
router.get("/graph/co-enter", async (req, res) => {
  const asset = req.query["asset"] ? String(req.query["asset"]) : undefined;
  const days  = Math.min(Number(req.query["days"] ?? 30), 90);
  const minCount = Math.max(Number(req.query["minCount"] ?? 1), 1);
  const edges = await coEntryEdges({ asset, lookbackDays: days, minCount });
  const ids = Array.from(new Set(edges.flatMap(e => [e.a, e.b])));
  const traders = await hydrateTraders(ids);
  res.json({
    edges: edges.slice(0, 200).map(e => ({
      asset: e.asset,
      count: e.count,
      lastTs: e.lastTs,
      a: traders.get(e.a) ?? { id: e.a },
      b: traders.get(e.b) ?? { id: e.b },
    })),
    totalEdges: edges.length,
  });
});

/** GET /api/graph/lead-follow/:traderId — leaders + followers for one trader. */
router.get("/graph/lead-follow/:traderId", async (req, res) => {
  const traderId = Number(req.params["traderId"]);
  if (!Number.isFinite(traderId)) { res.status(400).json({ error: "bad_id" }); return; }
  const days = Math.min(Number(req.query["days"] ?? 30), 90);
  const result = await leadFollowFor(traderId, { lookbackDays: days });
  const ids = Array.from(new Set([...result.leaders.map(l => l.traderId), ...result.followers.map(f => f.traderId)]));
  const hydrated = await hydrateTraders(ids);
  res.json({
    traderId,
    leaders:   result.leaders.map(l => ({ ...l, trader: hydrated.get(l.traderId) ?? { id: l.traderId } })),
    followers: result.followers.map(f => ({ ...f, trader: hydrated.get(f.traderId) ?? { id: f.traderId } })),
  });
});

/** GET /api/graph/similar/:traderId — wallets with most similar trade behaviour. */
router.get("/graph/similar/:traderId", async (req, res) => {
  const traderId = Number(req.params["traderId"]);
  if (!Number.isFinite(traderId)) { res.status(400).json({ error: "bad_id" }); return; }
  const topN = Math.min(Number(req.query["topN"] ?? 20), 50);
  const days = Math.min(Number(req.query["days"] ?? 60), 120);
  const list = await similarTraders(traderId, { topN, lookbackDays: days });
  const hydrated = await hydrateTraders(list.map(s => s.traderId));
  res.json({ traderId, similar: list.map(s => ({ ...s, trader: hydrated.get(s.traderId) ?? { id: s.traderId } })) });
});

/** GET /api/graph/narrative-leaders/:asset — who consistently enters this asset first. */
router.get("/graph/narrative-leaders/:asset", async (req, res) => {
  const asset = decodeURIComponent(String(req.params["asset"]));
  const days = Math.min(Number(req.query["days"] ?? 30), 90);
  const list = await narrativeLeaders(asset, { lookbackDays: days });
  const hydrated = await hydrateTraders(list.map(l => l.traderId));
  res.json({ asset, leaders: list.map(l => ({ ...l, trader: hydrated.get(l.traderId) ?? { id: l.traderId } })) });
});

/** GET /api/graph/wallet/:address — graph view for a raw wallet address. */
router.get("/graph/wallet/:address", async (req, res) => {
  const addr = String(req.params["address"]).toLowerCase();
  const [t] = await db.select({ id: tradersTable.id }).from(tradersTable).where(eq(tradersTable.walletAddress, addr)).limit(1);
  if (!t) { res.status(404).json({ error: "wallet_not_tracked" }); return; }
  const [lf, sim] = await Promise.all([leadFollowFor(t.id), similarTraders(t.id, { topN: 15 })]);
  const ids = Array.from(new Set([...lf.leaders.map(x => x.traderId), ...lf.followers.map(x => x.traderId), ...sim.map(s => s.traderId)]));
  const hydrated = await hydrateTraders(ids);
  res.json({
    walletAddress: addr,
    traderId: t.id,
    leaders:   lf.leaders.map(l => ({ ...l, trader: hydrated.get(l.traderId) })),
    followers: lf.followers.map(f => ({ ...f, trader: hydrated.get(f.traderId) })),
    similar:   sim.map(s => ({ ...s, trader: hydrated.get(s.traderId) })),
  });
});

export default router;
