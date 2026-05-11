import { Router, type IRouter } from "express";
import { getMarketActivity, summarize } from "../services/market-activity";

const router: IRouter = Router();

router.get("/markets/activity", async (_req, res) => {
  try {
    const activity = await getMarketActivity();
    const summary = summarize(activity);
    res.json({ activity, summary, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
