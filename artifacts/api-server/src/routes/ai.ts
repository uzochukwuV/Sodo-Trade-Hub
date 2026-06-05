import { Router, type IRouter } from "express";
import { runAiAgent, agentState } from "../services/ai-agent";

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

export default router;
