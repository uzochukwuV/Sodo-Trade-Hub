import { Router, type IRouter } from "express";
import { getTelegramStatus, sendTestMessage } from "../services/telegram";

const router: IRouter = Router();

router.get("/telegram/status", async (_req, res) => {
  const status = await getTelegramStatus();
  res.json(status);
});

router.post("/telegram/test", async (_req, res) => {
  const result = await sendTestMessage();
  res.json(result);
});

export default router;
