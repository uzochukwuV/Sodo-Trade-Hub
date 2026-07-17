import { Router, type IRouter } from "express";
import { runAiAgent, agentState } from "../services/ai-agent";
import { runAiTradeAnalyst } from "../services/ai-trade-analyst";

const router: IRouter = Router();

/** POST /api/ai/run — manual trigger */
router.post("/ai/run", async (req, res) => {
  if (agentState.isRunning) {
    res.status(409).json({ error: "agent_already_running" });
    return;
  }
  const result = await runAiAgent();
  res.json({ ok: true, ...result, lastRunAt: agentState.lastRunAt });
});

/** GET /api/ai/status */
router.get("/ai/status", (req, res) => {
  res.json({
    isRunning: agentState.isRunning,
    lastRunAt: agentState.lastRunAt,
    lastError: agentState.lastError,
    intentsPosted: agentState.intentsPosted,
    signalsPosted: agentState.signalsPosted,
  });
});

/** POST /api/ai/analyst — constrained LangGraph trade analyst */
router.post("/ai/analyst", async (req, res) => {
  try {
    const result = await runAiTradeAnalyst({
      question: String(req.body?.question ?? ""),
      startBlock: req.body?.startBlock === undefined ? undefined : Number(req.body.startBlock),
      blockCount: req.body?.blockCount === undefined ? undefined : Number(req.body.blockCount),
      wallets: Array.isArray(req.body?.wallets) ? req.body.wallets : undefined,
      threadId: typeof req.body?.threadId === "string" ? req.body.threadId : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: "ai_analyst_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
