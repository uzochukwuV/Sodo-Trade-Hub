import { Router, type IRouter } from "express";
import { analyzeLiveWallet, backtestNormalizedPositions, getLiveLeaderboard } from "../services/live-sodex-intel";

const router: IRouter = Router();

router.get("/wallets", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  const window = (String(req.query.window ?? "7D") as "24H" | "7D" | "30D" | "ALL_TIME");
  const wallets = await getLiveLeaderboard({ window, pageSize: limit });
  res.json({ wallets });
});

router.get("/wallets/rankings/copy", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const window = (String(req.query.window ?? "7D") as "24H" | "7D" | "30D" | "ALL_TIME");
  const leaderboard = await getLiveLeaderboard({ window, pageSize: limit });
  const candidates = leaderboard.map(item => ({
    walletAddress: item.walletAddress,
    accountId: item.accountId,
    displayName: `${item.walletAddress.slice(0, 8)}...${item.walletAddress.slice(-6)}`,
    score: 0,
    grade: "LIVE",
    confidence: 0,
    totalPnlUsd: item.pnlUsd,
    winRate: 0,
    tradeCount: 0,
    avgLeverage: 0,
    maxDrawdownUsd: 0,
    bestSymbol: null,
    volumeUsd: item.volumeUsd,
    reason: `SoDEX rank #${item.rank} · ${item.windowType} PnL $${item.pnlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} · click for live analysis`,
  }));
  res.json({ candidates });
});

router.get("/wallets/:address", async (req, res) => {
  const address = String(req.params.address).toLowerCase();
  const analysis = await analyzeLiveWallet(address, 200, req.query.accountId ? String(req.query.accountId) : null);
  res.json(analysis);
});

router.post("/wallets/:address/backtest", async (req, res) => {
  try {
    const address = String(req.params.address).toLowerCase();
    const analysis = await analyzeLiveWallet(address, 500, req.body?.accountId ?? null);
    const result = backtestNormalizedPositions(analysis.positions, {
      windowDays: Math.min(Math.max(Number(req.body?.windowDays ?? 30), 1), 365),
      startingBalanceUsd: Math.max(Number(req.body?.startingBalanceUsd ?? 1000), 1),
      tradeSizeUsd: Math.max(Number(req.body?.tradeSizeUsd ?? 100), 1),
      startDate: req.body?.startDate ? String(req.body.startDate) : null,
    });
    result.walletAddress = address;
    res.json({ result });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    res.status(message === "wallet_not_found" ? 404 : 500).json({ error: message });
  }
});

export default router;
