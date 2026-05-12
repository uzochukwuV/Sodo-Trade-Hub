import { Router, type IRouter } from "express";
import { getAccountState, getAccountTrades, getOrdersHistory } from "../services/sodex-rest";

const router: IRouter = Router();

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function parseLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.max(1, n), 200);
}

router.get("/accounts/:addr/state", async (req, res) => {
  const addr = req.params.addr.toLowerCase();
  if (!ADDR_RE.test(addr)) {
    res.status(400).json({ error: "addr must be a 0x-prefixed 40-char hex string" });
    return;
  }
  const state = await getAccountState(addr);
  if (!state) { res.status(502).json({ error: "Sodex account state unavailable" }); return; }
  res.json(state);
});

router.get("/accounts/:addr/trades", async (req, res) => {
  const addr = req.params.addr.toLowerCase();
  if (!ADDR_RE.test(addr)) { res.status(400).json({ error: "bad addr" }); return; }
  const limit = parseLimit(req.query["limit"]);
  const trades = await getAccountTrades(addr, limit);
  res.json({ trades });
});

router.get("/accounts/:addr/orders", async (req, res) => {
  const addr = req.params.addr.toLowerCase();
  if (!ADDR_RE.test(addr)) { res.status(400).json({ error: "bad addr" }); return; }
  const limit = parseLimit(req.query["limit"]);
  const orders = await getOrdersHistory(addr, limit);
  res.json({ orders });
});

export default router;
