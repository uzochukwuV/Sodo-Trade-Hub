import { Router, type IRouter } from "express";
import { analyzeIntent } from "../services/risk-analysis";

const router: IRouter = Router();

/**
 * POST /api/risk/analyze
 * Body: { asset: "BTC/USDT", side: "LONG"|"SHORT", entry: number, leverage: number }
 * Returns RiskAnalysis (see services/risk-analysis.ts). Powers the "auto-grade my intent"
 * panel on the Intents page so users get a data-backed sanity check before posting.
 */
router.post("/risk/analyze", async (req, res) => {
  const asset = String(req.body?.asset ?? "").trim();
  const side  = String(req.body?.side  ?? "").trim().toUpperCase() as "LONG" | "SHORT";
  const entry = Number(req.body?.entry);
  const leverage = Number(req.body?.leverage ?? 1);

  if (!asset) { res.status(400).json({ error: "missing_asset" }); return; }
  if (side !== "LONG" && side !== "SHORT") { res.status(400).json({ error: "bad_side" }); return; }
  if (!Number.isFinite(entry) || entry <= 0) { res.status(400).json({ error: "bad_entry" }); return; }
  if (!Number.isFinite(leverage) || leverage < 1 || leverage > 100) { res.status(400).json({ error: "bad_leverage" }); return; }

  const analysis = await analyzeIntent({ asset, side, entry, leverage });
  res.json(analysis);
});

export default router;
