import { Router, type IRouter } from "express";
import {
  analyzeValuechainRange,
  getValuechainInvestigation,
  listValuechainInvestigations,
  saveValuechainInvestigation,
  type RangeAnalysisResult,
} from "../services/valuechain-block-analyzer";

const router: IRouter = Router();
const MAX_BLOCK_COUNT = 20;

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

router.post("/valuechain/analyze-blocks", async (req, res) => {
  const startBlock = parsePositiveInt(req.body?.startBlock, -1);
  const requestedCount = parsePositiveInt(req.body?.blockCount, 1);
  const blockCount = Math.min(Math.max(1, requestedCount), MAX_BLOCK_COUNT);

  if (startBlock < 0) {
    res.status(400).json({ error: "invalid_start_block" });
    return;
  }
  if (requestedCount > MAX_BLOCK_COUNT) {
    res.status(400).json({ error: "block_count_too_high", max: MAX_BLOCK_COUNT });
    return;
  }

  try {
    const result = await analyzeValuechainRange({ startBlock, blockCount });
    res.json({ result });
  } catch (err) {
    res.status(502).json({
      error: "valuechain_analysis_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/valuechain/investigations", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const result = req.body?.result;
  const userId = req.session?.userId ?? null;

  if (!title) {
    res.status(400).json({ error: "missing_title" });
    return;
  }
  if (!result || typeof result !== "object") {
    res.status(400).json({ error: "missing_result" });
    return;
  }

  try {
    const investigation = await saveValuechainInvestigation({ title, userId, result: result as RangeAnalysisResult });
    res.json({ investigation });
  } catch (err) {
    res.status(500).json({
      error: "save_investigation_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/valuechain/investigations", async (req, res) => {
  const limit = Math.min(Math.max(1, parsePositiveInt(req.query["limit"], 20)), 50);
  const investigations = await listValuechainInvestigations(limit);
  res.json({ investigations });
});

router.get("/valuechain/investigations/:id", async (req, res) => {
  const id = parsePositiveInt(req.params["id"], -1);
  if (id < 1) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const investigation = await getValuechainInvestigation(id);
  if (!investigation) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(investigation);
});

export default router;
